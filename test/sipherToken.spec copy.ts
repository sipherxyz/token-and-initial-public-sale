import { ethers } from "hardhat"
import { expect } from "chai"
import { BigNumber, BigNumber as BN } from "@ethersproject/bignumber"
import { snapshot, revertToSnapshot, getCurrentBlockTime, mineNewBlockAt } from "./utils/hardhat"

import { SipherToken__factory, SipherToken } from "../typechain-types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADDRESS_ZERO, ONE_DAY } from "./utils"
import { sipherTokenVesting } from "./data"

describe("Sipher Token", () => {
    const ONE_TOKEN = BN.from(10).pow(18)
    const TIME_BLOCK = 2635200 // 30.5 days

    const NAME = "SipherToken"
    const SYMBOL = "SIPHER"
    const MAX_SUPPLY = ONE_TOKEN.mul(1_000_000_000)
    const GAMEPLAY_INCENTIVES_AND_MARKETING_FUND = ONE_TOKEN.mul(304_000_000)

    let SipherTokenContract: SipherToken
    let currentTime: number
    let snapshotId: any
    let owner: SignerWithAddress
    let notOwner: SignerWithAddress
    let signers: SignerWithAddress[]

    const deployContracts = async (startTime: number) => {
        const SipherTokenFactory = (await ethers.getContractFactory("SipherToken")) as SipherToken__factory
        return await SipherTokenFactory.deploy(NAME, SYMBOL, startTime)
    }

    // go back to the time of deployment
    const goBack = async () => {
        await revertToSnapshot(snapshotId)
        snapshotId = await snapshot()
    }

    before("deploy Sipher coin", async () => {
        currentTime = await getCurrentBlockTime()
        SipherTokenContract = await deployContracts(currentTime)
        snapshotId = await snapshot()
        ;[owner, notOwner, ...signers] = await ethers.getSigners()
    })

    describe("constants", () => {
        it("should have correct name", async () => {
            expect(await SipherTokenContract.name()).to.be.equal(NAME)
        })

        it("should have correct symbol", async () => {
            expect(await SipherTokenContract.symbol()).to.be.equal(SYMBOL)
        })

        it("should have correct max supply", async () => {
            expect(await SipherTokenContract.MAX_SUPPLY()).to.be.equal(MAX_SUPPLY)
        })

        it("should have correct gameplay incentives and marketing fund", async () => {
            expect(await SipherTokenContract.GAMEPLAY_INCENTIVES_AND_MARKETING_FUND()).to.be.equal(
                GAMEPLAY_INCENTIVES_AND_MARKETING_FUND
            )
        })

        it("should have correct start time", async () => {
            expect(await SipherTokenContract.START_TIME()).to.be.equal(BigNumber.from(currentTime))
        })
    })

    describe("burn", () => {
        describe("when burn amount is greater than balance", () => {
            it("should revert", async () => {
                await expect(SipherTokenContract.connect(notOwner).burn(ONE_TOKEN)).to.be.revertedWith(
                    "ERC20: burn amount exceeds balance"
                )
            })
        })
        describe("when burn amount is less than balance", () => {
            beforeEach(async () => {
                await goBack()
                await SipherTokenContract.release()
            })

            it("should decrease total supply", async () => {
                const totalSupply = await SipherTokenContract.totalSupply()
                await SipherTokenContract.burn(ONE_TOKEN)
                const newTotalSupply = await SipherTokenContract.totalSupply()

                expect(newTotalSupply).to.be.equal(totalSupply.sub(ONE_TOKEN))
            })

            it("should decrease burner's balance", async () => {
                const balance = await SipherTokenContract.balanceOf(owner.address)
                await SipherTokenContract.burn(ONE_TOKEN)
                const newBalance = await SipherTokenContract.balanceOf(owner.address)

                expect(newBalance).to.be.equal(balance.sub(ONE_TOKEN))
            })

            it("should emit Transfer event", () => {
                expect(SipherTokenContract.burn(ONE_TOKEN))
                    .to.emit(SipherTokenContract, "Transfer")
                    .withArgs(owner.address, ADDRESS_ZERO, ONE_TOKEN)
            })
        })
    })

    describe("release", () => {
        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherTokenContract.connect(notOwner).release()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
            it("should revert", async () => {
                await SipherTokenContract.transferOwnership(notOwner.address)
                await expect(SipherTokenContract.connect(owner).release()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
            after(async () => {
                await SipherTokenContract.connect(notOwner).transferOwnership(owner.address)
            })
        })

        describe("when the caller is the owner", () => {
            describe("when current block time is less than start time", () => {
                before(async () => {
                    SipherTokenContract = await deployContracts(currentTime + ONE_DAY)
                })
                it("should revert", async () => {
                    await expect(SipherTokenContract.connect(owner).release()).to.be.revertedWith(
                        "SipherToken.release: vesting has not started yet"
                    )
                })

                after(async () => {
                    SipherTokenContract = await deployContracts(currentTime)
                    snapshotId = await snapshot()
                })
            })

            describe("when current block time is greater than start time", () => {
                describe("when there is no token to release", () => {
                    before(async () => {
                        await goBack()
                        await SipherTokenContract.connect(owner).release()
                    })

                    it("should revert", async () => {
                        await expect(SipherTokenContract.connect(owner).release()).to.be.revertedWith(
                            "SipherToken.release: no token to release this time"
                        )
                    })
                })

                describe("when there are tokens to release", () => {
                    before(async () => {
                        await goBack()
                    })
                    sipherTokenVesting().forEach(month => {
                        describe(`when owner releases tokens in month ${month.id}`, () => {
                            it("should release correct amount", async () => {
                                mineNewBlockAt(currentTime + month.id * TIME_BLOCK + 100)
                                const ownerBalance = await SipherTokenContract.balanceOf(owner.address)
                                if (month.id === 15) {
                                    await expect(SipherTokenContract.release()).to.be.revertedWith(
                                        "SipherToken.release: no token to release this time"
                                    )
                                } else {
                                    await SipherTokenContract.release()
                                    const newReleased = await SipherTokenContract.getVestingReleasedAmount()
                                    const newOwnerBalance = await SipherTokenContract.balanceOf(owner.address)

                                    expect(newReleased).to.be.equal(ONE_TOKEN.mul(month.totalReleased))
                                    expect(newOwnerBalance).to.be.equal(ownerBalance.add(ONE_TOKEN.mul(month.released)))
                                }
                            })
                        })
                    })
                })
            })
        })
    })

    describe("requestToClaimNoScheduleFund", () => {
        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(
                    SipherTokenContract.connect(notOwner).requestToClaimNoScheduledFund(ONE_TOKEN)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })
            it("should revert", async () => {
                await SipherTokenContract.transferOwnership(notOwner.address)
                await expect(
                    SipherTokenContract.connect(owner).requestToClaimNoScheduledFund(ONE_TOKEN)
                ).to.be.revertedWith("Ownable: caller is not the owner")
            })
            after(async () => {
                await SipherTokenContract.connect(notOwner).transferOwnership(owner.address)
            })
        })

        describe("when the caller is the owner", () => {
            describe("when there are tokens that that haven't been claimed", () => {
                before(async () => {
                    await goBack()
                    SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)
                })

                it("should revert", async () => {
                    await expect(SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)).to.be.revertedWith(
                        "SipherToken.requestToClaimNoScheduledFund: claim is still pending"
                    )
                })
            })

            describe("when request amount is greater than requestable amount", () => {
                beforeEach(async () => {
                    await goBack()
                })

                it("should revert", async () => {
                    await expect(
                        SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN.mul(1000000000))
                    ).to.be.revertedWith("SipherToken.requestToClaimNoScheduledFund: invalid request amount")
                })
            })

            describe("when everything is valid", () => {
                beforeEach(async () => {
                    await goBack()
                })

                describe("when owner request 1 token", () => {
                    it("should set claim time to 3 days later", async () => {
                        await SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)
                        expect(await SipherTokenContract.getTimeToClaim()).to.be.gt(
                            BigNumber.from(currentTime + ONE_DAY * 3)
                        )
                    })

                    it("should set claim amount correctly", async () => {
                        await SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)
                        expect(await SipherTokenContract.getCurrentClaimAmount()).to.be.equal(ONE_TOKEN)
                    })

                    it("should emit RequestRelease event", async () => {
                        expect(await SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)).to.emit(
                            SipherTokenContract,
                            "RequestRelease"
                        )
                    })
                })
            })
        })
    })

    describe("claimNoScheduleFund", () => {
        describe("when the caller is not the owner", () => {
            it("should revert", async () => {
                await expect(SipherTokenContract.connect(notOwner).claimNoScheduledFund()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
            it("should revert", async () => {
                await SipherTokenContract.transferOwnership(notOwner.address)
                await expect(SipherTokenContract.connect(owner).claimNoScheduledFund()).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                )
            })
            after(async () => {
                await SipherTokenContract.connect(notOwner).transferOwnership(owner.address)
            })
        })

        describe("when the caller is the owner", () => {
            describe("when current time is less than claim time", async () => {
                before(async () => {
                    await goBack()
                    await SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)
                })
                it("should revert", async () => {
                    await expect(SipherTokenContract.claimNoScheduledFund()).to.be.revertedWith(
                        "SipherToken.claimNoScheduledFund: not the time to claim"
                    )
                })
            })

            describe("when current time is greater than claim time", () => {
                describe("when there is no token to claim", () => {
                    before(async () => {
                        await goBack()
                    })

                    it("should revert", async () => {
                        await expect(SipherTokenContract.claimNoScheduledFund()).to.be.revertedWith(
                            "SipherToken.claimNoScheduledFund: nothing to claim"
                        )
                    })
                })

                describe("when there are tokens to claim", () => {
                    beforeEach(async () => {
                        await goBack()
                        await SipherTokenContract.requestToClaimNoScheduledFund(ONE_TOKEN)
                        await mineNewBlockAt(currentTime + ONE_DAY * 5)
                    })

                    it("should reset claim amount to 0", async () => {
                        await SipherTokenContract.claimNoScheduledFund()
                        expect(await SipherTokenContract.getCurrentClaimAmount()).to.be.equal(ONE_TOKEN.mul(0))
                    })

                    it("should increase no scheduled released", async () => {
                        const noScheduledReleased = await SipherTokenContract.getNoScheduledReleasedAmount()
                        await SipherTokenContract.claimNoScheduledFund()
                        const newNoScheduledReleased = await SipherTokenContract.getNoScheduledReleasedAmount()

                        expect(newNoScheduledReleased).to.be.equal(noScheduledReleased.add(ONE_TOKEN))
                    })

                    it("should increase owner's token balance", async () => {
                        const ownerBalance = await SipherTokenContract.balanceOf(owner.address)
                        await SipherTokenContract.claimNoScheduledFund()
                        const newOwnerBalance = await SipherTokenContract.balanceOf(owner.address)

                        expect(newOwnerBalance).to.be.equal(ownerBalance.add(ONE_TOKEN))
                    })

                    it("should emit Transfer event", () => {
                        expect(SipherTokenContract.claimNoScheduledFund())
                            .to.emit(SipherTokenContract, "Transfer")
                            .withArgs(ADDRESS_ZERO, owner.address, ONE_TOKEN)
                    })
                })
            })
        })
    })
})
