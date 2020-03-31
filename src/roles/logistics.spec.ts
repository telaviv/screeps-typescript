/* eslint no-loop-func: "off" */

import filter from 'lodash/filter'
import { mockStructure } from 'screeps-jest'

import roleLogistics, { calculateParts } from './logistics'

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

describe('calculateParts()', () => {
    it('produces the correct amount of parts', () => {
        const checks = [
            { capacity: 300, work: 1, carry: 1, move: 2 },
            { capacity: 350, work: 1, carry: 1, move: 2 },
            { capacity: 400, work: 1, carry: 1, move: 2 },
            { capacity: 450, work: 1, carry: 1, move: 2 },
            { capacity: 500, work: 2, carry: 2, move: 4 },
            { capacity: 550, work: 2, carry: 2, move: 4 },
            { capacity: 600, work: 2, carry: 2, move: 4 },
        ]

        for (const { capacity, work, move, carry } of checks) {
            const parts = calculateParts(capacity)
            const works = filter(parts, p => p === WORK)
            const moves = filter(parts, p => p === MOVE)
            const carrys = filter(parts, p => p === CARRY)
            expect(works.length).toEqual(work)
            expect(moves.length).toEqual(move)
            expect(carrys.length).toEqual(carry)
        }
    })
})
