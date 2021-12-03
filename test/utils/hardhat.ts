import { BigNumber } from "@ethersproject/bignumber"
import { ethers, network } from "hardhat"

export const runWithImpersonation = async (target: string, run: () => Promise<void>): Promise<void> => {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [target],
    })

    await run()

    await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [target],
    })
}

export const snapshot = async () => {
    return await network.provider.request({
        method: "evm_snapshot",
    })
}

export const revertToSnapshot = async (snapshotId: any) => {
    return await network.provider.request({
        method: "evm_revert",
        params: [snapshotId],
    })
}

export const getCurrentBlockTime = async () => {
    return (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
}

export const mineNewBlockAt = async (timestamp: number) => {
    await network.provider.request({
        method: "evm_mine",
        params: [timestamp],
    })
}

export const increaseTime = async (timestamp: number) => {
    await network.provider.request({
        method: "evm_increaseTime",
        params: [timestamp],
    })
}
export const decreaseTime = async (timestamp: number) => {
    await network.provider.request({
        method: "evm_",
        params: [timestamp],
    })
}

export const etherToWei = (ether: number) => {
    return BigNumber.from(10)
        .pow(9)
        .mul(ether * 10 ** 9)
}
