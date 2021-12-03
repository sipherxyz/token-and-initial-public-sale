export const ibcoWithdrawTable = [
    { deposit: 0.5, withdraw: 0.5 },
    { deposit: 1, withdraw: 1 },
    { deposit: 1.25, withdraw: 0.8625 },
    { deposit: 4, withdraw: 2.68 },
    { deposit: 10, withdraw: 6.2 },
    { deposit: 13, withdraw: 7.67 },
    { deposit: 20, withdraw: 10.8 },
    { deposit: 40, withdraw: 15.6 },
    { deposit: 90, withdraw: 11.7 },
    { deposit: 121, withdraw: 6.05 },
    { deposit: 130, withdraw: 5.2 },
    { deposit: 150, withdraw: 3 },
    { deposit: 1000, withdraw: 30 },
]

export const ibcoLockedTable = [
    { deposit: 1, locked: 0 },
    { deposit: 150, locked: 147 },
    { deposit: 1000, locked: 970 },
]

export const sipherTokenVesting = () => {
    let maxAmounts = [{ id: 0, released: 55_000_000, totalReleased: 55_000_000 }]
    let count = 1

    let data = [
        { priceStep: 7_727_273, months: 2 },
        { priceStep: 7_977_273, months: 9 },
        { priceStep: 250_000, months: 3 },
        { priceStep: 0, months: 1 },
        { priceStep: 19_472_222, months: 14 },
        { priceStep: 25_305_556, months: 4 },
        { priceStep: 16_250_000, months: 6 },
        { priceStep: 5_833_333, months: 13 },
        { priceStep: 5_833_336, months: 1 },
    ]

    data.forEach(step => {
        for (let i = 0; i < step.months; i++) {
            maxAmounts.push({
                id: count,
                released: step.priceStep,
                totalReleased: maxAmounts[count - 1].totalReleased + step.priceStep,
            })
            count++
        }
    })
    return maxAmounts
}

export const VestingWithEmissionSchedule = () => {
    let maxAmounts = [{ month: 0, max: 55000000 }]
    let count = 1

    let data = [
        { priceStep: 16171717, months: 2 },
        { priceStep: 16421718, months: 9 },
        { priceStep: 8694445, months: 3 },
        { priceStep: 8444445, months: 1 },
        { priceStep: 27916667, months: 14 },
        { priceStep: 33750000, months: 4 },
        { priceStep: 24694445, months: 2 },
    ]

    data.forEach(step => {
        for (let i = 0; i < step.months; i++) {
            maxAmounts.push({ month: count, max: maxAmounts[count - 1].max + step.priceStep })
            count++
        }
    })
    return maxAmounts
}
