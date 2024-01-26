import { Room, StructureSpawn } from 'screeps';
import SourcesManager from './sources-manager';
import SourceManager from './source-manager';
import roleHarvester from 'roles/harvester';

describe('SourcesManager', () => {
    let room: Room;
    let sourcesManager: SourcesManager;

    beforeEach(() => {
        // Mock the Room object
        room = {} as Room;
        room.find = jest.fn().mockReturnValue([]);

        // Create a new SourcesManager instance
        sourcesManager = new SourcesManager(room);
    });

    describe('hasEnoughHarvesters', () => {
        it('returns true when all source managers have enough harvesters', () => {
            // Mock the hasEnoughHarvesters method of SourceManager
            const mockSourceManager = {
                hasEnoughHarvesters: jest.fn().mockReturnValue(true),
            } as unknown as SourceManager;
            sourcesManager.sourceManagers = [mockSourceManager, mockSourceManager];

            const result = sourcesManager.hasEnoughHarvesters();

            expect(result).toBe(true);
            expect(mockSourceManager.hasEnoughHarvesters).toHaveBeenCalledTimes(2);
        });

        it('returns false when at least one source manager does not have enough harvesters', () => {
            // Mock the hasEnoughHarvesters method of SourceManager
            const mockSourceManager1 = {
                hasEnoughHarvesters: jest.fn().mockReturnValue(true),
            } as unknown as SourceManager;
            const mockSourceManager2 = {
                hasEnoughHarvesters: jest.fn().mockReturnValue(false),
            } as unknown as SourceManager;
            sourcesManager.sourceManagers = [mockSourceManager1, mockSourceManager2];

            const result = sourcesManager.hasEnoughHarvesters();

            expect(result).toBe(false);
            expect(mockSourceManager1.hasEnoughHarvesters).toHaveBeenCalledTimes(1);
            expect(mockSourceManager2.hasEnoughHarvesters).toHaveBeenCalledTimes(1);
        });
    });

    // Add more test cases for other methods...

    describe('createHarvester', () => {
        it('throws an error when there are no available positions for harvester', () => {
            // Mock the getNextHarvesterMiningTarget method to return null
            sourcesManager.getNextHarvesterMiningTarget = jest.fn().mockReturnValue(null);

            expect(() => sourcesManager.createHarvester({} as StructureSpawn)).toThrowError(
                'No available positions for harvester'
            );
            expect(sourcesManager.getNextHarvesterMiningTarget).toHaveBeenCalledTimes(1);
        });

        it('calls the roleHarvester.create method with the correct arguments', () => {
            const mockSpawn = {} as StructureSpawn;
            const mockTarget = { source: 'sourceId', pos: {} as RoomPosition };
            // Mock the getNextHarvesterMiningTarget method to return a target
            sourcesManager.getNextHarvesterMiningTarget = jest.fn().mockReturnValue(mockTarget);
            // Mock the SourceManager.getById method to return a source manager
            SourceManager.getById = jest.fn().mockReturnValue({ id: 'sourceId' } as SourceManager);
            // Mock the roleHarvester.create method
            roleHarvester.create = jest.fn().mockReturnValue(123);

            const result = sourcesManager.createHarvester(mockSpawn);

            expect(result).toBe(123);
            expect(sourcesManager.getNextHarvesterMiningTarget).toHaveBeenCalledTimes(1);
            expect(SourceManager.getById).toHaveBeenCalledWith('sourceId');
            expect(roleHarvester.create).toHaveBeenCalledWith(mockSpawn, mockTarget.pos, 'sourceId');
        });
    });
});
