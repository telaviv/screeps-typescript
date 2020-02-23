import { mockGlobal, mockInstanceOf, mockStructure } from 'screeps-jest'
import { StrategyPhase } from 'strategy'
import roleLogistics, { Logistics } from './logistics'

const ROOM_NAME = 'A1'
const source1 = mockInstanceOf<Source>({ id: 'source1' as Id<Source> })
const source2 = mockInstanceOf<Source>({ id: 'source2' as Id<Source> })
const extension = mockStructure(STRUCTURE_EXTENSION)
const room = mockInstanceOf<Room>({
    name: ROOM_NAME,
    find: (type: FindConstant) => {
        switch (type) {
            case FIND_SOURCES:
                return [source1, source2]
            case FIND_STRUCTURES:
                return [extension]
            default:
                return []
        }
    },
})

describe('Logistics role', () => {
    describe('run', () => {
        it("should harvest, when it's near a source and not full", () => {
            const creep = mockInstanceOf<Logistics>({
                harvest: () => OK,
                room,
                source: source1.id,
                carry: { energy: 0 },
                carryCapacity: 100,
                memory: { source: source1.id },
                pos: { findClosestByRange: () => null },
                pickup: () => {},
            })

            const roomMemory = mockInstanceOf<RoomMemory>({
                strategy: StrategyPhase.DropMining,
                sources: [{ id: source1.id }],
            })
            mockGlobal<Memory>('Memory', {
                creeps: {},
                rooms: { [ROOM_NAME]: roomMemory },
            })
            mockGlobal<Game>('Game', { getObjectById: () => source1 })

            roleLogistics.run(creep)
            expect(creep.harvest).toHaveBeenCalledWith(source1)
        })

        it("should fill structures, when it's full and near a non-full structure", () => {
            const creep = mockInstanceOf<Logistics>({
                room,
                carry: { energy: 100 },
                carryCapacity: 100,
                source: 'drop-mining',
                transfer: () => OK,
            })

            roleLogistics.run(creep)
            expect(creep.transfer).toHaveBeenCalledWith(
                extension,
                RESOURCE_ENERGY,
            )
            expect(creep.room.find).toHaveBeenCalledWith(FIND_STRUCTURES, {
                filter: roleLogistics.isToBeFilled,
            })
        })
    })

    describe('isToBeFilled', () => {
        it('should accept extension, spawns and towers that are not full', () => {
            ;[STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER].forEach(
                structureType => {
                    const structure = mockStructure(structureType, {
                        energy: 0,
                        energyCapacity: 100,
                    })
                    expect(roleLogistics.isToBeFilled(structure)).toBeTruthy()
                },
            )
        })

        it('should reject extension, spawns and towers that are already full', () => {
            ;[STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER].forEach(
                structureType => {
                    const structure = mockStructure(structureType, {
                        energy: 100,
                        energyCapacity: 100,
                    })
                    expect(roleLogistics.isToBeFilled(structure)).toBeFalsy()
                },
            )
        })

        it('should reject any other structure type', () => {
            ;[
                STRUCTURE_CONTAINER,
                STRUCTURE_CONTROLLER,
                STRUCTURE_EXTRACTOR,
                STRUCTURE_KEEPER_LAIR,
                STRUCTURE_LAB,
                STRUCTURE_LINK,
                STRUCTURE_NUKER,
                STRUCTURE_OBSERVER,
                STRUCTURE_PORTAL,
                STRUCTURE_POWER_BANK,
                STRUCTURE_POWER_SPAWN,
                STRUCTURE_RAMPART,
                STRUCTURE_ROAD,
                STRUCTURE_STORAGE,
                STRUCTURE_TERMINAL,
                STRUCTURE_WALL,
            ].forEach(structureType => {
                const structure = mockStructure(structureType)
                expect(roleLogistics.isToBeFilled(structure)).toBeFalsy()
            })
        })
    })
})
