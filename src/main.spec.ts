import 'roles/builder'
import 'roles/logistics'
import 'roles/upgrader'
import { mockGlobal, mockInstanceOf, mockStructure } from '../test/mocking'
import { unwrappedLoop } from './main'
import roleBuilder from './roles/builder'
import roleHarvester from './roles/logistics'
import roleUpgrader from './roles/upgrader'
import { runSpawn } from './spawn'
import { runTower } from './tower'

jest.mock('roles/builder')
jest.mock('roles/logistics')
jest.mock('roles/upgrader')
jest.mock('spawn')
jest.mock('tower')
jest.mock('surveyor')

const builder = mockInstanceOf<Creep>({
    memory: {
        role: 'builder',
    },
})
const logistics = mockInstanceOf<Creep>({
    memory: {
        role: 'logistics',
    },
})
const upgrader = mockInstanceOf<Creep>({
    memory: {
        role: 'upgrader',
    },
})

const myController = mockInstanceOf<StructureController>({
    my: true,
})
const someoneElsesController = mockInstanceOf<StructureController>({
    my: false,
})
const tower1 = mockStructure(STRUCTURE_TOWER)
const tower2 = mockStructure(STRUCTURE_TOWER)
const spawn1 = mockStructure(STRUCTURE_SPAWN)
const spawn2 = mockStructure(STRUCTURE_SPAWN)
const myRoomWithoutStructures = mockInstanceOf<Room>({
    controller: myController,
    find: () => [],
})
const myRoomWithTowers = mockInstanceOf<Room>({
    controller: myController,
    find: () => [tower1, tower2],
})
const myRoomWithSpawns = mockInstanceOf<Room>({
    controller: myController,
    find: () => [spawn1, spawn2],
})
const someoneElsesRoom = mockInstanceOf<Room>({
    controller: someoneElsesController,
})
const noOnesRoom = mockInstanceOf<Room>({
    controller: undefined,
})

describe('main loop', () => {
    it('should run every creep', () => {
        mockGlobal<Game>('Game', {
            creeps: {
                builder,
                logistics,
                upgrader,
            },
            rooms: {},
            time: 1,
        })
        mockGlobal<Memory>('Memory', {
            creeps: {},
        })
        unwrappedLoop()
        expect(roleBuilder.run).toHaveBeenCalledWith(builder)
        expect(roleHarvester.run).toHaveBeenCalledWith(logistics)
        expect(roleUpgrader.run).toHaveBeenCalledWith(upgrader)
    })

    it('should clean up the memory from deceased creeps', () => {
        mockGlobal<Game>('Game', {
            creeps: {
                stillKicking: logistics,
            },
            rooms: {},
            time: 1,
        })
        mockGlobal<Memory>('Memory', {
            creeps: {
                dead: {
                    role: 'garbage',
                },
                goner: {
                    role: 'waste',
                },
                stillKicking: logistics.memory,
            },
        })
        unwrappedLoop()
        expect(Memory.creeps).toEqual({ stillKicking: logistics.memory })
    })

    it('should run every tower in my rooms', () => {
        mockGlobal<Game>('Game', {
            creeps: {},
            rooms: {
                myRoomWithTowers,
                myRoomWithoutStructures,
                noOnesRoom,
                someoneElsesRoom,
            },
            time: 1,
        })
        mockGlobal<Memory>('Memory', {
            creeps: {},
        })
        unwrappedLoop()
        expect(runTower).toHaveBeenCalledWith(tower1)
        expect(runTower).toHaveBeenCalledWith(tower2)
    })

    it('should run every spawn in my rooms', () => {
        mockGlobal<Game>('Game', {
            creeps: {},
            rooms: {
                myRoomWithSpawns,
                myRoomWithoutStructures,
                noOnesRoom,
                someoneElsesRoom,
            },
            time: 1,
        })
        mockGlobal<Memory>('Memory', {
            creeps: {},
        })
        unwrappedLoop()
        expect(runSpawn).toHaveBeenCalledWith(spawn1)
        expect(runSpawn).toHaveBeenCalledWith(spawn2)
    })
})
