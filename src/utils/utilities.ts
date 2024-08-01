export function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]
}

export function getRandomIntInclusive(min: number, max: number): number {
    const minCeiled = Math.ceil(min)
    const maxFloored = Math.floor(max)
    return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled) // The maximum is inclusive and the minimum is inclusive
}

export function randomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

export function calcTransactionAmount(
    amount: number,
    roomName1: string,
    roomName2: string,
): number {
    const dist = Game.map.getRoomLinearDistance(roomName1, roomName2)
    return Math.floor(amount / (2 - Math.exp(-dist / 30)))
}
