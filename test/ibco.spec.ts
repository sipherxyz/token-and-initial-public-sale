import { BigNumber } from "@ethersproject/bignumber"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { describe } from "mocha"
import {
    SipherIBCO,
    SipherIBCO__factory,
    SipherToken,
    SipherToken__factory,
    MockStakingPool,
    MockStakingPool__factory,
} from "../typechain-types"
import { mineNewBlockAt, revertToSnapshot, snapshot, etherToWei } from "./utils/hardhat"
import { ONE_DAY, ADDRESS_ZERO } from "./utils/constants"
import { ibcoWithdrawTable } from "./data"

describe("Sipher IBCO", () => {
    const START_TIME = 1638752400 // Monday, December 6, 2021 12:00:00 AM GMT+07:00
    const END_TIME = START_TIME + ONE_DAY * 3 // Sunday, December 5, 2021 12:00:00 AM GMT+07:00
    const ONE_ETHER = BigNumber.from(10).pow(18)
    const ONE_TOKEN = BigNumber.from(10).pow(18)
    const TOTAL_DISTRIBUTE_AMOUNT = ONE_TOKEN.mul(40000000) // 40 millions
    const MINIMAL_PROVIDE_AMOUNT = ONE_ETHER.mul(3200) // 6 thousands
    const SIPHER_TOKEN_START_TIME = 1637659242 // Tuesday, November 23, 2021 9:20:42 AM

    let snapshotId: any
    let SipherTokenContract: SipherToken
    let SipherIBCOContract: SipherIBCO
    let MockStakingPoolContract: MockStakingPool
    let owner: SignerWithAddress
    let notOwner: SignerWithAddress
    let user: SignerWithAddress
    let otherUser: SignerWithAddress
    let signers: SignerWithAddress[]

    const deployContracts = async () => {
        const SipherTokenFactory = (await ethers.getContractFactory("SipherToken")) as SipherToken__factory
        const SipherIBCOFactory = (await ethers.getContractFactory("SipherIBCO")) as SipherIBCO__factory
        const MockStakingPoolFactory = (await ethers.getContractFactory("MockStakingPool")) as MockStakingPool__factory

        SipherTokenContract = await SipherTokenFactory.deploy("Sipher Token", "SIPHER", SIPHER_TOKEN_START_TIME)
        SipherIBCOContract = await SipherIBCOFactory.deploy(SipherTokenContract.address)
        MockStakingPoolContract = await MockStakingPoolFactory.deploy()
    }

    const goBack = async () => {
        await revertToSnapshot(snapshotId)
        snapshotId = await snapshot()
    }

    before(async () => {
        await deployContracts()
        await SipherTokenContract.release()

        snapshotId = await snapshot()
        ;[owner, notOwner, user, otherUser, ...signers] = await ethers.getSigners()
    })

    describe("Deployment", () => {
        it("should return correct Token Contract address", async () => {
            expect(await SipherIBCOContract.SIPHER()).to.equal(SipherTokenContract.address)
        })

        it("should return correct START time", async () => {
            expect(await SipherIBCOContract.START()).to.equal(START_TIME)
        })

        it("should return correct END time", async () => {
            expect(await SipherIBCOContract.END()).to.equal(END_TIME)
        })

        it("should return correct TOTAL_DISTRIBUTE_AMOUNT", async () => {
            expect(await SipherIBCOContract.TOTAL_DISTRIBUTE_AMOUNT()).to.equal(TOTAL_DISTRIBUTE_AMOUNT)
        })

        it("should return correct MINIMAL_PROVIDE_AMOUNT", async () => {
            expect(await SipherIBCOContract.MINIMAL_PROVIDE_AMOUNT()).to.equal(MINIMAL_PROVIDE_AMOUNT)
        })

        it("should return totalProvided = 0", async () => {
            expect(await SipherIBCOContract.totalProvided()).to.equal(0)
        })

        it("should transfer TOTAL_DISTRIBUTE_AMOUNT to SipherIBCO contract", async () => {
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
            expect(await SipherTokenContract.balanceOf(SipherIBCOContract.address)).to.equal(TOTAL_DISTRIBUTE_AMOUNT)
        })
    })

    describe("deposit", async () => {
        before(async () => {
            await goBack()
        })
        describe("when the offering hasn't started", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME - ONE_DAY)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })).to.be.revertedWith(
                    "The offering has not started yet"
                )
            })
        })

        describe("when the offering is on going", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME + 1)
            })
            describe("when the SIPHER token in contract is insufficient", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })).to.be.revertedWith(
                        "Insufficient SIPHER token in contract"
                    )
                })
            })

            describe("when the SIPHER token in contract is sufficient", () => {
                before(async () => {
                    await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                })

                it("should emit Deposit event", async () => {
                    expect(await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER }))
                        .to.emit(SipherIBCOContract, "Deposit")
                        .withArgs(user.address, ONE_ETHER)
                })

                it("should increase totalProvided", async () => {
                    const totalProvided = await SipherIBCOContract.totalProvided()
                    await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })
                    const newTotalProvided = await SipherIBCOContract.totalProvided()
                    expect(newTotalProvided).to.equal(totalProvided.add(ONE_ETHER))
                })

                it("should increate user's provided", async () => {
                    const userProvided = await SipherIBCOContract.provided(user.address)
                    await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })
                    const newUserProvided = await SipherIBCOContract.provided(user.address)
                    expect(newUserProvided).to.equal(userProvided.add(ONE_ETHER))
                })
            })
        })

        describe("when the offering has ended", () => {
            before(async () => {
                await mineNewBlockAt(END_TIME + 1)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })).to.be.revertedWith(
                    "The offering has already ended"
                )
            })
        })
    })

    describe("claim", () => {
        before(async () => {
            await goBack()
        })

        describe("when the offering has't started", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME - ONE_DAY)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).claim()).to.be.revertedWith("The offering has not ended")
            })
        })

        describe("when the offering is ongoing", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).claim()).to.be.revertedWith("The offering has not ended")
            })
        })

        describe("when the offering has ended", () => {
            before(async () => {
                await mineNewBlockAt(END_TIME)
            })

            describe("when user hasn't deposited any ether", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(user).claim()).to.be.revertedWith("Empty balance")
                })
            })
        })

        describe("when totalProvided is less than MINIMAL_PROVIDE_AMOUNT and user deposited 12 ether", () => {
            const depositAmount = ONE_ETHER.mul(12)
            const claimedToken = ONE_TOKEN.mul(150000)

            beforeEach(async () => {
                await goBack()
                await mineNewBlockAt(START_TIME)
                await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                await SipherIBCOContract.connect(user).deposit({
                    value: depositAmount,
                })
                await mineNewBlockAt(END_TIME)
            })

            it("should emit Claimed(user.address, 12 ethers, 150000 token)  and user should have 80000 token", () => {
                expect(SipherIBCOContract.connect(user).claim())
                    .to.emit(SipherIBCOContract, "Claim")
                    .withArgs(user.address, depositAmount, claimedToken)
            })

            it("should user's token be equal to 80000", async () => {
                await SipherIBCOContract.connect(user).claim()
                expect(await SipherTokenContract.balanceOf(user.address)).to.equal(claimedToken)
            })
        })

        describe("when totalProvided is more than MINIMAL_PROVIDE_AMOUNT", () => {
            const depositAmount = ONE_ETHER.mul(7000)
            const claimedToken = ONE_TOKEN.mul(40_000_000)

            beforeEach(async () => {
                await goBack()
                await mineNewBlockAt(START_TIME)
                await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                await SipherIBCOContract.connect(user).deposit({
                    value: depositAmount,
                })
                await mineNewBlockAt(END_TIME)
            })

            it("should emit Claimed(user.address, 7000 ethers, 40_000_000 token) and user should have 40_000_000 token ", async () => {
                expect(SipherIBCOContract.connect(user).claim())
                    .to.emit(SipherIBCOContract, "Claim")
                    .withArgs(user.address, depositAmount, claimedToken)
            })

            it("should user's token be equal to 40_000_000", async () => {
                await SipherIBCOContract.connect(user).claim()
                expect(await SipherTokenContract.balanceOf(user.address)).to.equal(claimedToken)
            })
        })
    })

    describe("getUserDeposited", async () => {
        const depositAmount = ONE_ETHER.mul(2)
        const depositAmount2 = ONE_ETHER.mul(3)

        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        it("should return correct amount of ether deposited", async () => {
            await SipherIBCOContract.connect(user).deposit({
                value: depositAmount,
            })
            expect(await SipherIBCOContract.getUserDeposited(user.address)).to.equal(depositAmount)
        })

        it("should accumulate user's deposit", async () => {
            await SipherIBCOContract.connect(user).deposit({
                value: depositAmount2,
            })
            expect(await SipherIBCOContract.getUserDeposited(user.address)).to.equal(depositAmount.add(depositAmount2))
        })
    })

    describe("getWithdrawableAmount", async () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        // have to power by 9 and power by 9 to not be overflow
        ibcoWithdrawTable.forEach((record, idx) => {
            it(`should return ${record.withdraw} for ${record.deposit} ether deposited`, async () => {
                const users = await ethers.getSigners()
                const depositAmount = etherToWei(record.deposit)
                await SipherIBCOContract.connect(users[idx]).deposit({ value: depositAmount })
                expect(await SipherIBCOContract.getWithdrawableAmount(users[idx].address)).to.be.equal(
                    etherToWei(record.withdraw)
                )
            })
        })
    })

    describe("getLockedAmount", () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when user deposited 10 ether", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(10) })
            })

            it("should return 3.8 ether", async () => {
                expect(await SipherIBCOContract.getLockedAmount(user.address)).to.be.equal(etherToWei(3.8))
            })
        })
    })

    describe("getLockAmountAfterDeposit", () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when user didn't deposit", () => {
            describe("when user intends to deposit 10 ether", () => {
                it("should return 3.8 ether", async () => {
                    expect(
                        await SipherIBCOContract.getLockAmountAfterDeposit(user.address, ONE_ETHER.mul(10))
                    ).to.be.equal(etherToWei(3.8))
                })
            })
        })

        describe("when user deposited 10 ether", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(10) })
            })
            describe("when user intends to deposit 30 ether", () => {
                it("should return 24.4 ether", async () => {
                    expect(
                        await SipherIBCOContract.getLockAmountAfterDeposit(user.address, ONE_ETHER.mul(30))
                    ).to.be.equal(etherToWei(24.4))
                })
            })
        })

        describe("when user deposited 10 ether and withdrawed 5 ether", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).withdraw(ONE_ETHER.mul(5))
            })

            describe("when user intends to deposit 1 ether", () => {
                it("should return 3.8 ether", async () => {
                    expect(
                        await SipherIBCOContract.getLockAmountAfterDeposit(user.address, ONE_ETHER.mul(1))
                    ).to.be.equal(etherToWei(3.8))
                })
            })

            describe("when user intends to deposit 15 ether", () => {
                it("should return 9.2 ether", async () => {
                    expect(
                        await SipherIBCOContract.getLockAmountAfterDeposit(user.address, ONE_ETHER.mul(15))
                    ).to.be.equal(etherToWei(9.2))
                })
            })
        })
    })

    describe("getAccumulatedAfterDeposit", () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when user didn't deposit", () => {
            describe("when user intends to deposit 10 ether", () => {
                it("should return 10 ether", async () => {
                    expect(
                        await SipherIBCOContract.getAccumulatedAfterDeposit(user.address, ONE_ETHER.mul(10))
                    ).to.equal(ONE_ETHER.mul(10))
                })
            })
        })

        describe("when user deposited 10 ether", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(10) })
            })
            describe("when user intends to deposit 20 ether", () => {
                it("should return 30 ether", async () => {
                    expect(
                        await SipherIBCOContract.getAccumulatedAfterDeposit(user.address, ONE_ETHER.mul(20))
                    ).to.be.equal(ONE_ETHER.mul(30))
                })
            })
        })

        describe("when user deposited 10 ether and withdrawed 5 ether", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).withdraw(ONE_ETHER.mul(5))
            })

            describe("when user intends to deposit 1 ether", () => {
                it("should return 10 ether", async () => {
                    expect(
                        await SipherIBCOContract.getAccumulatedAfterDeposit(user.address, ONE_ETHER.mul(1))
                    ).to.be.equal(ONE_ETHER.mul(10))
                })
            })

            describe("when user intends to deposit 20 ether", () => {
                it("should return 25 ether", async () => {
                    expect(
                        await SipherIBCOContract.getAccumulatedAfterDeposit(user.address, ONE_ETHER.mul(20))
                    ).to.be.equal(ONE_ETHER.mul(25))
                })
            })
        })
    })

    describe("withdraw", async () => {
        before(async () => {
            await goBack()
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when the offering hasn't started", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME - ONE_DAY)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).withdraw(ONE_ETHER)).to.be.revertedWith(
                    "Only withdrawable during the Offering duration"
                )
            })
        })

        describe(`when the offering is ongoing`, () => {
            before(async () => {
                await mineNewBlockAt(START_TIME)
            })

            describe("when user doesn't deposit any ether", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.withdraw(ONE_ETHER)).to.be.revertedWith("Insufficient balance")
                })
            })

            describe("when user withdraw more than deposit amount", () => {
                before(async () => {
                    await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER })
                })

                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(user).withdraw(ONE_ETHER.mul(2))).to.be.revertedWith(
                        "Insufficient balance"
                    )
                })
            })

            describe("when user withdraw more than withdrawable amount", () => {
                before(async () => {
                    await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(40000) })
                })

                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(user).withdraw(ONE_ETHER.mul(20000))).to.be.revertedWith(
                        "Invalid amount"
                    )
                })
            })

            describe("when user withdraw will decrease locked amount", () => {
                before(async () => {
                    await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(10) })
                    await SipherIBCOContract.connect(otherUser).withdraw(ONE_ETHER.mul(5))
                    await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(10) })

                    // accumulated: 20 - provided: 15 - locked 9.2
                    // withdrawable is calculated on accumulated, in this case 20
                    // so on the book user can withdraw up to 10.8 ether
                    // but withdraw 10 will drop provided to 5, lower than locked amount
                    // so it is not allowed
                })

                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(otherUser).withdraw(ONE_ETHER.mul(10))).to.be.revertedWith(
                        "Invalid amount"
                    )
                })
            })

            describe("when user withdraw less than withdrawable amount", () => {
                beforeEach(async () => {
                    await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(10) })
                })

                it("should emit Withdraw event", async () => {
                    await expect(SipherIBCOContract.connect(otherUser).withdraw(ONE_ETHER.mul(5)))
                        .to.emit(SipherIBCOContract, "Withdraw")
                        .withArgs(otherUser.address, ONE_ETHER.mul(5))
                })

                it("should increase user's balance", async () => {
                    const userBalance = await otherUser.getBalance()
                    await SipherIBCOContract.connect(otherUser).withdraw(ONE_ETHER.mul(5))
                    const newUserBalance = await otherUser.getBalance()

                    expect(newUserBalance).to.be.gt(userBalance)
                })
            })
        })

        describe("when theo offering has ended", () => {
            before(async () => {
                await mineNewBlockAt(END_TIME)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(user).withdraw(ONE_ETHER)).to.be.revertedWith(
                    "Only withdrawable during the Offering duration"
                )
            })
        })
    })

    describe("getEstTokenPrice", () => {
        before(async () => {
            await goBack()
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when totalProvided is less than MINIMAL_PROVIDE_AMOUNT", () => {
            it("should token price be equal to 0.00008 ether", async () => {
                expect(await SipherIBCOContract.getEstTokenPrice()).be.equal(etherToWei(0.00008))
            })
        })

        describe("when totalProvided is more than MINIMAL_PROVIDE_AMOUNT (10000)", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME)
                await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(10000) })
            })

            it("should token price be equal to 0.00025 ether", async () => {
                expect(await SipherIBCOContract.getEstTokenPrice()).be.equal(etherToWei(0.00025))
            })
        })
    })

    describe("getEstReceivedToken", () => {
        before(async () => {
            await goBack()
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when totalProvided is less than MINIMAL_PROVIDE_AMOUNT", () => {
            before(async () => {
                await mineNewBlockAt(START_TIME)
            })
            describe("when user deposit 3 ether", () => {
                before(async () => {
                    await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(3) })
                })
                it("should receive 37500 token", async () => {
                    expect(await SipherIBCOContract.getEstReceivedToken(user.address)).to.equal(ONE_TOKEN.mul(37500))
                })
            })
        })

        describe("when totalProvided is more than MINIMAL_PROVIDE_AMOUNT (10000)", () => {
            before(async () => {
                await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(9994) })
            })

            describe("when user deposit 3 ther", () => {
                before(async () => {
                    await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(3) })
                })

                it("should receive 12000 token", async () => {
                    expect(await SipherIBCOContract.getEstReceivedToken(otherUser.address)).to.equal(
                        ONE_TOKEN.mul(12000)
                    )
                })
            })
        })
    })

    describe("withdrawSaleFunds", () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(notOwner).withdrawSaleFunds()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
        })

        describe("when the caller the owner", () => {
            describe("when the offering has not ended", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(owner).withdrawSaleFunds()).to.be.revertedWith(
                        "The offering has not ended"
                    )
                })
            })

            describe("when the offering has ended", () => {
                before(async () => {
                    await mineNewBlockAt(END_TIME + 1000)
                })

                describe("when the contract's balance is empty", () => {
                    it("should revert", async () => {
                        await expect(SipherIBCOContract.connect(owner).withdrawSaleFunds()).to.be.revertedWith(
                            "Contract's balance is empty"
                        )
                    })
                })

                describe("when the contract's balance is not empty (100 ether)", () => {
                    const contractBalance = ONE_ETHER.mul(100)

                    before(async () => {
                        await goBack()
                        await mineNewBlockAt(START_TIME)
                        await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                        await SipherIBCOContract.connect(otherUser).deposit({ value: contractBalance })
                        await mineNewBlockAt(END_TIME + 100)
                    })

                    it("should transfer all contract's balance to owner", async () => {
                        const ownerBalance = await owner.getBalance()
                        await SipherIBCOContract.connect(owner).withdrawSaleFunds()
                        const newOwnerBalance = await owner.getBalance()

                        expect(newOwnerBalance).to.be.gt(ownerBalance)
                        await expect(SipherIBCOContract.connect(owner).withdrawSaleFunds()).to.be.revertedWith(
                            "Contract's balance is empty"
                        )
                    })
                })
            })
        })
    })

    describe("withdrawUnclaimedSIPHER", async () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
        })

        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(notOwner).withdrawRemainedSIPHER()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
        })

        describe("when the caller is the owner", () => {
            describe("when the offering has not ended", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(owner).withdrawRemainedSIPHER()).to.be.revertedWith(
                        "The offering has not ended"
                    )
                })
            })

            describe("when the offering has ended", () => {
                describe("when `totalProvided` is greater is equal than `MINIMAL_PROVIDE_AMOUNT`", () => {
                    before(async () => {
                        await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(7000) })
                        await mineNewBlockAt(END_TIME)
                    })
                    it("should revert", async () => {
                        await expect(SipherIBCOContract.connect(owner).withdrawRemainedSIPHER()).to.be.revertedWith(
                            "Total provided must be less than minimal provided"
                        )
                    })
                })

                describe("when `totalProvided` is smaller than `MINIMAL_PROVIDE_AMOUNT` (3000 ether)", () => {
                    before(async () => {
                        await goBack()
                        await mineNewBlockAt(START_TIME)
                        await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                        await SipherIBCOContract.connect(otherUser).deposit({ value: ONE_ETHER.mul(3000) })
                        await mineNewBlockAt(END_TIME)
                    })

                    it("should returns 2,500,000 token to owner", async () => {
                        const oldTokenBalance = await SipherTokenContract.balanceOf(owner.address)
                        await SipherIBCOContract.connect(owner).withdrawRemainedSIPHER()
                        const newTokenbalance = await SipherTokenContract.balanceOf(owner.address)

                        expect(newTokenbalance).to.be.equal(oldTokenBalance.add(ONE_TOKEN.mul(2500000)))
                    })
                })
            })
        })
    })

    describe("withdrawUnclaimedSIPHER", () => {
        before(async () => {
            await goBack()
            await mineNewBlockAt(START_TIME)
        })

        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(notOwner).withdrawRemainedSIPHER()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
        })

        describe("when the caller is the owner", () => {
            describe("when current time is less than one month after `END_TIME`", () => {
                it("should revert", async () => {
                    await expect(SipherIBCOContract.connect(owner).withdrawUnclaimedSIPHER()).to.be.revertedWith(
                        "Withdrawal is unavailable"
                    )
                })
            })

            describe("when current time is more than one month after `END_TIME`", () => {
                describe("when the contract has no unclaimed sipher", () => {
                    it("should revert", async () => {
                        await mineNewBlockAt(END_TIME + ONE_DAY * 31)
                        await expect(SipherIBCOContract.connect(owner).withdrawUnclaimedSIPHER()).to.be.revertedWith(
                            "No token to withdraw"
                        )
                    })
                })

                describe("when the contract has unclaimed token", () => {
                    before(async () => {
                        await goBack()
                        await mineNewBlockAt(START_TIME)
                        await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                        await mineNewBlockAt(END_TIME + ONE_DAY * 31)
                    })

                    it("should transfer all token to owner's wallet", async () => {
                        const oldTokenBalance = await SipherTokenContract.balanceOf(owner.address)
                        await SipherIBCOContract.connect(owner).withdrawUnclaimedSIPHER()
                        const newTokenBalance = await SipherTokenContract.balanceOf(owner.address)
                        expect(newTokenBalance).to.equal(oldTokenBalance.add(TOTAL_DISTRIBUTE_AMOUNT))
                    })
                })
            })
        })
    })

    describe("setApproveForStaking", () => {
        before(async () => {
            await goBack()
            await SipherIBCOContract.connect(owner).setApproveForStaking(MockStakingPoolContract.address)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
            await mineNewBlockAt(START_TIME)
        })

        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(notOwner).withdrawRemainedSIPHER()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
        })

        describe("when the offering has ended", () => {
            before(async () => {
                await mineNewBlockAt(END_TIME + 100)
            })

            it("should revert", async () => {
                await expect(
                    SipherIBCOContract.connect(owner).setApproveForStaking(MockStakingPoolContract.address)
                ).to.be.revertedWith("Only allow edit before the Offer ends")
            })
        })

        describe("when the address is address zero", () => {
            before(async () => {
                await goBack()
                await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                await mineNewBlockAt(START_TIME)
            })

            it("should revert", async () => {
                await expect(SipherIBCOContract.connect(owner).setApproveForStaking(ADDRESS_ZERO)).to.be.revertedWith(
                    "Invalid address"
                )
            })
        })
    })

    describe("claimAndDepositForStaking", () => {
        before(async () => {
            await goBack()
            await SipherIBCOContract.connect(owner).setApproveForStaking(MockStakingPoolContract.address)
            await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
            await mineNewBlockAt(START_TIME)
        })

        describe("when the offering hasn't ended", () => {
            it("should revert", async () => {
                await expect(
                    SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN, 600)
                ).to.be.revertedWith("The offering has not ended")
            })
        })

        describe("when the offering has ended", () => {
            before(async () => {
                await mineNewBlockAt(END_TIME + 100)
            })

            describe("when the input duration is less than 600 seconds", () => {
                it("should revert", async () => {
                    await expect(
                        SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN, 0)
                    ).to.be.revertedWith("Minimum duration is 10 minutes")
                })
            })

            describe("when the input duration is valid", () => {
                describe("when input amount is 0", () => {
                    it("should revert", async () => {
                        await expect(
                            SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN.mul(0), 600)
                        ).to.be.revertedWith("Invalid amount")
                    })
                })

                describe("when input amount is greater than claimable amount", () => {
                    before(async () => {
                        await goBack()
                        await SipherIBCOContract.connect(owner).setApproveForStaking(MockStakingPoolContract.address)
                        await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                        await mineNewBlockAt(START_TIME)
                        await SipherIBCOContract.connect(user).deposit({ value: ONE_TOKEN })
                        await mineNewBlockAt(END_TIME)
                    })

                    it("should revert", async () => {
                        await expect(
                            SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN.mul(1000000), 600)
                        ).to.be.revertedWith("Invalid amount")
                    })
                })

                describe("when input amount is valid", () => {
                    beforeEach(async () => {
                        await goBack()
                        await SipherIBCOContract.connect(owner).setApproveForStaking(MockStakingPoolContract.address)
                        await SipherTokenContract.transfer(SipherIBCOContract.address, TOTAL_DISTRIBUTE_AMOUNT)
                        await mineNewBlockAt(START_TIME)
                        await SipherIBCOContract.connect(user).deposit({ value: ONE_ETHER.mul(10) })
                        await mineNewBlockAt(END_TIME)
                    })

                    it("should decrease user's total deposited, therefore decreate estimated receive tokens", async () => {
                        const receivedToken = await SipherIBCOContract.getEstReceivedToken(user.address)
                        await SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN, 600)
                        const newReceivedToken = await SipherIBCOContract.getEstReceivedToken(user.address)

                        return expect(newReceivedToken).to.be.equal(receivedToken.sub(ONE_TOKEN))
                    })

                    it("should emit ClaimAndDepositToStake event", async () => {
                        expect(await SipherIBCOContract.connect(user).claimAndDepositForStaking(ONE_TOKEN, 600))
                            .to.emit(SipherIBCOContract, "ClaimAndDepositToStake")
                            .withArgs(user.address, ONE_TOKEN, 600)
                    })
                })
            })
        })
    })
})
