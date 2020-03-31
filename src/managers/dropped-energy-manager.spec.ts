/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import { bootstrapGlobals } from 'testing/bootstrap'
import { ROOM_NAME } from 'testing/constants'
import { createCreep } from 'testing/mocks/creep'

import DroppedEnergy from './dropped-energy-manager'

describe('dropped-energy module', () => {
    let droppedEnergy: DroppedEnergy
    beforeEach(() => {
        bootstrapGlobals()
        const memory = Memory.rooms[ROOM_NAME].sources[0].dropSpot
        droppedEnergy = DroppedEnergy.create(memory)
    })
    describe('DroppedEnergy', () => {
        describe('#availableEnergy', () => {
            it('equals 0 when no energy is provided', () => {
                expect(droppedEnergy.availableEnergy()).toEqual(0)
            })

            it('equals the energy amount when energy is provided', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 50)

                expect(droppedEnergy.availableEnergy()).toEqual(50)
            })

            it('is subtracted from the request amount', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 1000)
                const creep1 = createCreep<Creep>([CARRY])
                const creep2 = createCreep<Creep>([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                droppedEnergy.request(creep1)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - CARRY_CAPACITY,
                )

                droppedEnergy.request(creep2)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 3 * CARRY_CAPACITY,
                )
            })

            it('is modified by complete requests', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 1000)
                const creep1 = createCreep<Creep>([CARRY])
                const creep2 = createCreep<Creep>([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                droppedEnergy.request(creep1)
                droppedEnergy.request(creep2)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 3 * CARRY_CAPACITY,
                )

                droppedEnergy.completeRequest(creep1)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 2 * CARRY_CAPACITY,
                )

                droppedEnergy.completeRequest(creep2)

                expect(droppedEnergy.availableEnergy()).toEqual(1000)
            })

            it('is modified by cleanup', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 1000)
                const creep1 = createCreep<Creep>([CARRY])
                const creep2 = createCreep<Creep>([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                droppedEnergy.request(creep1)
                droppedEnergy.request(creep2)

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 3 * CARRY_CAPACITY,
                )

                delete Game.creeps[creep1.name]

                droppedEnergy.cleanup()

                expect(droppedEnergy.availableEnergy()).toEqual(
                    1000 - 2 * CARRY_CAPACITY,
                )
            })
        })
    })
})
