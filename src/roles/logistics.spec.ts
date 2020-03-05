import { mockStructure } from 'screeps-jest'

import { bootstrapGlobals } from 'testing/bootstrap'
import { createCreep } from 'testing/mocks/creep'
import { ROOM_NAME as TEST_ROOM } from 'testing/constants'
import roleLogistics, { Logistics } from './logistics'

const extension = mockStructure(STRUCTURE_EXTENSION)

describe('Logistics role', () => {
    describe('run', () => {
        beforeEach(() => {
            bootstrapGlobals()
        })
        it("should harvest, when it's near a source and not full", () => {
            const source = Memory.rooms[TEST_ROOM].sources[0]
            const creep = createCreep<Logistics>([CARRY])
            const harvestMock = jest.fn()

            creep.room.find = () => []
            creep.harvest = harvestMock
            roleLogistics.run(creep)
            expect(harvestMock.mock.calls[0][0].id).toEqual(source.id)
        })

        it("should fill structures, when it's full and near a non-full structure", () => {
            const creep = createCreep<Logistics>([CARRY])
            const transferMock = jest.fn()

            creep.room.find = () => [extension]
            creep.store.getFreeCapacity = () => 0
            creep.transfer = transferMock
            creep.harvest = jest.fn()
            roleLogistics.run(creep)

            roleLogistics.run(creep)
            expect(creep.transfer).toHaveBeenCalledWith(
                extension,
                RESOURCE_ENERGY,
            )
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
