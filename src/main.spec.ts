import 'roles/builder'
import 'roles/harvester'
import 'roles/upgrader'
import { mockGlobal, mockInstanceOf, mockStructure } from '../test/mocking'
import { unwrappedLoop } from './main'
import roleBuilder from './roles/builder'
import roleHarvester from './roles/harvester'
import roleUpgrader from './roles/upgrader'
import { runSpawn } from './spawn'
import { runTower } from './tower'

jest.mock('roles/builder')
jest.mock('roles/harvester')
jest.mock('roles/upgrader')
jest.mock('spawn')
jest.mock('tower')

const builder = mockInstanceOf<Creep>({
    memory: {
        role: 'builder',
    },
})
const harvester = mockInstanceOf<Creep>({
    memory: {
        role: 'harvester',
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
const myRoomWithTowers = mockInstanceOf<Room>({
    controller: myController,
    find: () => [tower1, tower2],
})
const myRoomWithoutTowers = mockInstanceOf<Room>({
    controller: myController,
    find: () => [],
})
const myRoomWithSpawns = mockInstanceOf<Room>({
    controller: myController,
    find: () => [spawn1, spawn2],
})
const myRoomWithoutSpawns = mockInstanceOf<Room>({
    controller: myController,
    find: () => [],
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
                harvester,
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
        expect(roleHarvester.run).toHaveBeenCalledWith(harvester)
        expect(roleUpgrader.run).toHaveBeenCalledWith(upgrader)
    })

    it('should clean up the memory from deceased creeps', () => {
        mockGlobal<Game>('Game', {
            creeps: {
                stillKicking: harvester,
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
                stillKicking: harvester.memory,
            },
        })
        unwrappedLoop()
        expect(Memory.creeps).toEqual({ stillKicking: harvester.memory })
    })

    it('should run every tower in my rooms', () => {
        mockGlobal<Game>('Game', {
            creeps: {},
            rooms: {
                myRoomWithTowers,
                myRoomWithoutTowers,
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
                myRoomWithoutSpawns,
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
