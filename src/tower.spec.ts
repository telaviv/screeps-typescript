import { isDamaged, runTower } from "tower";
import { mockInstanceOf, mockStructure } from "../test/mocking";

describe("tower module", () => {

  describe("runTower", () => {

    it("should attack the nearest hostile creep, if there is one in the room", () => {
      const hostileCreep = mockInstanceOf<Creep>();
      const tower = mockInstanceOf<StructureTower>({
        attack: () => OK,
        pos: mockInstanceOf<RoomPosition>({
          findClosestByRange: (type: any) => type === FIND_HOSTILE_CREEPS ? hostileCreep : null
        })
      });
      runTower(tower);
      expect(tower.attack).toHaveBeenCalledWith(hostileCreep);
    });

    it("should repair the nearest damaged structure, if there is one in the room", () => {
      const damagedStructure = mockStructure(STRUCTURE_EXTENSION);
      const tower = mockInstanceOf<StructureTower>({
        pos: mockInstanceOf<RoomPosition>({
          findClosestByRange: (type: any) => type === FIND_STRUCTURES ? damagedStructure : null
        }),
        repair: () => OK
      });
      runTower(tower);
      expect(tower.pos.findClosestByRange).toHaveBeenCalledWith(FIND_STRUCTURES, { filter: isDamaged });
      expect(tower.repair).toHaveBeenCalledWith(damagedStructure);
    });

    it("should not do anything, otherwise", () => {
      const tower = mockInstanceOf<StructureTower>({
        attack: () => OK,
        heal: () => OK,
        pos: {
          findClosestByRange: () => null
        },
        repair: () => OK
      });
      runTower(tower);
      expect(tower.attack).not.toHaveBeenCalled();
      expect(tower.repair).not.toHaveBeenCalled();
      expect(tower.heal).not.toHaveBeenCalled();
    });

  });

  describe("isDamaged", () => {

    it("should return false if the structure has full health", () => {
      const structure = mockInstanceOf<StructureSpawn>({
        hits: 5000,
        hitsMax: 5000
      });
      expect(isDamaged(structure)).toBeFalsy();
    });

    it("should return true if the structure doesn't have full health", () => {
      const structure = mockInstanceOf<StructureSpawn>({
        hits: 3000,
        hitsMax: 5000
      });
      expect(isDamaged(structure)).toBeTruthy();
    });

  });

});
