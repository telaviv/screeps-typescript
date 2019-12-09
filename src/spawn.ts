import roleHarvester from 'roles/harvester'

function runSpawn(spawn: StructureSpawn) {
    roleHarvester.create(spawn)
}

export { runSpawn }
