import { mockStructure } from 'screeps-jest'

import roleLogistics from './logistics'

describe('Logistics role', () => {
    describe('needsEnergy', () => {
        it('should accept extension, spawns and towers that are not full', () => {
            ;[STRUCTURE_EXTENSION, STRUCTURE_SPAWN, STRUCTURE_TOWER].forEach(
                structureType => {
                    const structure = mockStructure(structureType, {
                        energy: 0,
                        energyCapacity: 100,
                    })
                    expect(roleLogistics.needsEnergy(structure)).toBeTruthy()
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
                    expect(roleLogistics.needsEnergy(structure)).toBeFalsy()
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
                expect(roleLogistics.needsEnergy(structure)).toBeFalsy()
            })
        })
    })
})
