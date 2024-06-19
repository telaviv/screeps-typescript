export function add(pos: RoomPosition, posSet: RoomPosition[]): void {
    const found = posSet.find((npos) => pos.isEqualTo(npos))
    if (!found) {
        posSet.push(pos)
    }
}

export function merge(arr: RoomPosition[], posSet: RoomPosition[]): void {
    for (const pos of arr) {
        add(pos, posSet)
    }
}
