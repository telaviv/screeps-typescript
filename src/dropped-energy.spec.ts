/* eslint @typescript-eslint/no-explicit-any: ["off"] */

import DroppedEnergy from 'dropped-energy'

import { bootstrapGlobals, ROOM_NAME } from 'testing/bootstrap'
import createCreep from 'testing/mocks/creep'

describe('dropped-energy module', () => {
    beforeEach(() => {
        bootstrapGlobals()
    })
    describe('DroppedEnergy', () => {
        describe('#availableEnergy', () => {
            it('equals 0 when no energy is provided', () => {
                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
                expect(droppedEnergy.availableEnergy()).toEqual(0)
            })

            it('equals the energy amount when energy is provided', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 50)

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)

                expect(droppedEnergy.availableEnergy()).toEqual(50)
            })

            it('is subtracted from the request amount', () => {
                const room = Game.rooms[ROOM_NAME] as MockRoom
                room.addEnergy(0, 0, 1000)
                const creep1 = createCreep([CARRY])
                const creep2 = createCreep([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
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
                const creep1 = createCreep([CARRY])
                const creep2 = createCreep([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
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
                const creep1 = createCreep([CARRY])
                const creep2 = createCreep([CARRY, CARRY])
                Game.creeps[creep1.name] = creep1
                Game.creeps[creep2.name] = creep2

                const droppedEnergy = new DroppedEnergy(ROOM_NAME, 0)
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
