import { BigNumber } from "@ethersproject/bignumber"
import { Contract } from "@ethersproject/contracts"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { ADDRESS_ZERO } from "./utils/constants"
import { revertToSnapshot, snapshot } from "./utils/hardhat"

interface Input {
    name: string
    symbol: string
    initialSupply: BigNumber
    deployFn: () => Promise<Contract>
}

const behaveLikeERC20 = ({ name, symbol, initialSupply, deployFn }: Input) => {
    let token: Contract
    let accounts: SignerWithAddress[] = []
    let snapshotId: any
    before(async () => {
        token = await deployFn()
        accounts = await ethers.getSigners()
        snapshotId = await snapshot()
    })

    beforeEach(async () => {
        await revertToSnapshot(snapshotId)
        snapshotId = await snapshot()
    })

    describe("ERC20", () => {
        it("has a correct name", async () => {
            expect(await token.name()).to.equal(name)
        })

        it("has a correct symbol", async () => {
            expect(await token.symbol()).to.equal(symbol)
        })

        it("has 18 decimals", async () => {
            expect(await token.decimals()).to.equal(18)
        })

        describe("total supply", () => {
            it("returns the total amount of tokens", async () => {
                expect(await token.totalSupply()).to.be.equal(initialSupply)
            })
        })

        describe("balanceOf", () => {
            describe("when the requested account has no tokens", () => {
                it("should return zero", async () => {
                    const [, otherAccount] = accounts
                    expect(await token.balanceOf(otherAccount.address)).to.be.equal(0)
                })
            })

            describe("when owner requested", () => {
                it("should return the initial supply", async () => {
                    const [owner] = accounts
                    expect(await token.balanceOf(owner.address)).to.be.equal(initialSupply)
                })
            })
        })

        describe("transfer from", () => {
            describe("when the token owner is not the zero address", () => {
                describe("when the recipient is not the zero address", () => {
                    describe("when the spender has enough approved balance", () => {
                        describe("when the token owner has enough balance", () => {
                            beforeEach(async () => {
                                const [owner, spender] = accounts
                                await token.connect(owner).approve(spender.address, initialSupply)
                            })

                            const amount = initialSupply

                            it("should transfer the requested amount", async () => {
                                const [owner, spender, recipient] = accounts

                                await token.connect(spender).transferFrom(owner.address, recipient.address, amount)

                                expect(await token.balanceOf(owner.address)).to.equal(0)
                                expect(await token.balanceOf(recipient.address)).to.equal(amount)
                            })

                            it("should decrease the spender allowance", async () => {
                                const [owner, spender, recipient] = accounts
                                await token.connect(spender).transferFrom(owner.address, recipient.address, amount)

                                expect(await token.allowance(owner.address, spender.address)).to.equal(0)
                            })

                            it("should emit a transfer event", async () => {
                                const [owner, spender, recipient] = accounts

                                expect(token.connect(spender).transferFrom(owner.address, recipient.address, amount))
                                    .to.emit(token, "Transfer")
                                    .withArgs(owner.address, recipient.address, amount)
                            })

                            it("should emit a approval event", async () => {
                                const [owner, spender, recipient] = accounts

                                expect(token.connect(spender).transferFrom(owner.address, recipient.address, amount))
                                    .to.emit(token, "Approval")
                                    .withArgs(owner.address, spender.address, 0)
                            })
                        })

                        describe("when the token owner does not have enough balance", () => {
                            beforeEach(async () => {
                                const [, owner, spender] = accounts
                                await token.connect(owner).approve(spender.address, initialSupply)
                            })

                            const amount = initialSupply

                            it("should revert", async () => {
                                const [, owner, spender, recipient] = accounts
                                await expect(
                                    token.connect(spender).transferFrom(owner.address, recipient.address, amount)
                                ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
                            })
                        })
                    })

                    describe("when the spender does not have enough approved balance", () => {
                        const amount = initialSupply

                        describe("when the token owner has enough balance", () => {
                            it("should revert", async () => {
                                const [owner, spender, recipient] = accounts
                                await expect(
                                    token.connect(spender).transferFrom(owner.address, recipient.address, amount)
                                ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
                            })
                        })

                        describe("when the token owner does not have enough balance", () => {
                            it("should revert", async () => {
                                const [, owner, spender, recipient] = accounts
                                await expect(
                                    token.connect(spender).transferFrom(owner.address, recipient.address, amount)
                                ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
                            })
                        })
                    })
                })

                describe("when the recipient is the zero address", () => {
                    const recipient = ADDRESS_ZERO
                    const amount = initialSupply

                    beforeEach(async () => {
                        const [owner, spender] = accounts

                        await token.connect(owner).approve(spender.address, amount)
                    })

                    it("should revert", async () => {
                        const [owner, spender] = accounts
                        await expect(
                            token.connect(spender).transferFrom(owner.address, recipient, amount)
                        ).to.be.revertedWith("ERC20: transfer to the zero address")
                    })
                })
            })

            describe("when the token owner is the zero address", () => {
                const amount = 0

                it("should revert", async () => {
                    const [owner, recipient] = accounts
                    await expect(
                        token.connect(owner).transferFrom(ADDRESS_ZERO, recipient.address, amount)
                    ).to.be.revertedWith("ERC20: transfer from the zero address")
                })
            })
        })

        describe("transfer", () => {
            describe("when the recipient is not the zero address", () => {
                describe("when the sender does not have enough balance", () => {
                    it("should revert", async () => {
                        const [, sender, recipient] = accounts
                        expect(token.connect(sender).transfer(recipient.address, 1)).to.be.revertedWith(
                            "ERC20: transfer amount exceeds balance"
                        )
                    })
                })
                describe("when the sender transfers all balance", () => {
                    it("should transfers the requested amount", async () => {
                        const [owner, recipient] = accounts
                        const ownerBalance = await token.balanceOf(owner.address)
                        await token.connect(owner).transfer(recipient.address, ownerBalance)
                        expect(await token.balanceOf(owner.address)).to.be.equal(0)
                        expect(await token.balanceOf(recipient.address)).to.be.equal(ownerBalance)
                    })
                    it("should emit a transfer event", async () => {
                        const [owner, recipient] = accounts
                        const ownerBalance = await token.balanceOf(owner.address)
                        expect(token.connect(owner).transfer(recipient.address, ownerBalance))
                            .to.emit(token, "Transfer")
                            .withArgs(owner.address, recipient.address, ownerBalance)
                    })
                })
                describe("when the sender transfer zero tokens", () => {
                    it("should transfer the requested amount", async () => {
                        const [owner, recipient] = accounts
                        const ownerBalance = await token.balanceOf(owner.address)
                        await token.connect(owner).transfer(recipient.address, 0)
                        expect(await token.balanceOf(owner.address)).to.be.equal(ownerBalance)
                        expect(await token.balanceOf(recipient.address)).to.be.equal(0)
                    })
                    it("should emit a transfer event", () => {
                        const [owner, recipient] = accounts
                        expect(token.connect(owner).transfer(recipient.address, 0))
                            .to.emit(token, "Transfer")
                            .withArgs(owner.address, recipient.address, 0)
                    })
                })
            })

            describe("when the recipient is the zero address", () => {
                it("should revert", async () => {
                    const [owner] = accounts
                    await expect(token.connect(owner).transfer(ADDRESS_ZERO, 0)).to.be.revertedWith(
                        "ERC20: transfer to the zero address"
                    )
                })
            })
        })

        describe("approve", () => {
            describe("when the spender is not the zero address", () => {
                describe("when the sender has enough balance", () => {
                    it("should emit an approval event", async () => {
                        const [sender, spender] = accounts
                        const senderBalance = await token.balanceOf(sender.address)

                        expect(token.connect(sender).approve(spender.address, senderBalance))
                            .to.emit(token, "Approval")
                            .withArgs(sender.address, spender.address, senderBalance)
                    })

                    it("should approve the requested amount", async () => {
                        const [sender, spender] = accounts
                        const senderBalance = await token.balanceOf(sender.address)
                        const spenderAllowance = await token.allowance(sender.address, spender.address)
                        await token.connect(sender).approve(spender.address, senderBalance)

                        expect(await token.allowance(sender.address, spender.address)).to.equal(
                            spenderAllowance + senderBalance
                        )
                    })
                })

                describe("when the sender does not have enough balance", () => {
                    it("should emit an approval event", async () => {
                        const [, sender, spender] = accounts
                        const senderBalance = await token.balanceOf(sender.address)
                        expect(token.connect(sender).approve(spender.address, senderBalance + 1))
                            .to.emit(token, "Approval")
                            .withArgs(sender.address, spender.address, senderBalance + 1)
                    })

                    it("should approve the requested amount", async () => {
                        const [sender, spender] = accounts
                        await token.connect(sender).approve(spender.address, 1)

                        expect(await token.allowance(sender.address, spender.address)).to.equal(1)
                    })
                })
            })

            describe("when the spender is the zero address", () => {
                it("should revert", async () => {
                    const [owner] = accounts
                    await expect(token.connect(owner).approve(ADDRESS_ZERO, 1)).to.be.revertedWith(
                        "ERC20: approve to the zero address"
                    )
                })
            })
        })

        describe("increaseAllowance", () => {
            const addedValue = 100

            describe("when the spender is not the zero address", () => {
                it("should emit an approval event", async () => {
                    const [owner, spender] = accounts
                    const spenderAllowance = await token.allowance(owner.address, spender.address)
                    expect(token.connect(owner).increaseAllowance(spender.address, addedValue))
                        .to.emit(token, "Approval")
                        .withArgs(owner.address, spender.address, spenderAllowance.toNumber() + addedValue)
                })

                it("should increase the spender's allowance", async () => {
                    const [owner, spender] = accounts
                    const spenderAllowance = await token.allowance(owner.address, spender.address)
                    await token.connect(owner).increaseAllowance(spender.address, addedValue)
                    expect(await token.allowance(owner.address, spender.address)).to.equal(
                        spenderAllowance.toNumber() + addedValue
                    )
                })
            })

            describe("when the spender is the zero address", () => {
                it("should revert", async () => {
                    const [owner] = accounts
                    await expect(token.connect(owner).increaseAllowance(ADDRESS_ZERO, addedValue)).to.be.revertedWith(
                        "ERC20: approve to the zero address"
                    )
                })
            })
        })

        describe("decreaseAllowance", () => {
            const subtractedValue = 100

            describe("when the spender is not the zero address", () => {
                describe("when the spender's allowance is not underflow", () => {
                    beforeEach(async () => {
                        const [owner, spender] = accounts
                        await token.connect(owner).increaseAllowance(spender.address, subtractedValue)
                    })

                    it("should emit an approval event", async () => {
                        const [owner, spender] = accounts
                        const spenderAllowance = await token.allowance(owner.address, spender.address)
                        expect(token.connect(owner).decreaseAllowance(spender.address, subtractedValue))
                            .to.emit(token, "Approval")
                            .withArgs(owner.address, spender.address, spenderAllowance.toNumber() - subtractedValue)
                    })

                    it("should decrease the spender's allowance", async () => {
                        const [owner, spender] = accounts
                        const spenderAllowance = await token.allowance(owner.address, spender.address)
                        await token.connect(owner).decreaseAllowance(spender.address, subtractedValue)
                        const newSpenderAllowance = await token.allowance(owner.address, spender.address)
                        expect(newSpenderAllowance).to.equal(spenderAllowance.toNumber() - subtractedValue)
                    })
                })

                describe("when the spender's allowance is underflow", () => {
                    it("should revert", async () => {
                        const [owner, spender] = accounts
                        await expect(
                            token.connect(owner).decreaseAllowance(spender.address, subtractedValue)
                        ).to.be.revertedWith("ERC20: decreased allowance below zero")
                    })
                })
            })
        })
    })
}

export default behaveLikeERC20
