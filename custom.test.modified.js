// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const aliceKeypair = new Keypair() // contains private and public keys
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })
    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })

    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )

    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to pool
      { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    const aliceWithdrawAmount = utils.parseEther('0.08')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceBalChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(aliceWithdrawAmount),
      keypair: aliceKeypair,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDepositUtxo],
      outputs: [aliceBalChangeUtxo],
      recipient: recipient,
    })

    const recipientBal = await token.balanceOf(recipient)
    expect(recipientBal).to.be.equal(aliceWithdrawAmount)
    const omniBridgeBal = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBal).to.be.equal(0)
    const tornadoPoolBal = await token.balanceOf(tornadoPool.address)
    expect(tornadoPoolBal).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const aliceKeypair = new Keypair()
    const aliceDepositAmount = utils.parseEther('0.13')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })

    const { args, extData } = await prepareTransaction({ tornadoPool, outputs: [aliceDepositUtxo] })
    const onTokenBridgedData = encodeDataForBridge({ proof: args, extData })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )
    await token.transfer(omniBridge.address, aliceDepositAmount)
    const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

    await omniBridge.execute([
      { who: token.address, callData: transferTx.data },
      { who: tornadoPool.address, callData: onTokenBridgedTx.data },
    ])
    const bobKeypair = new Keypair()
    const bobAddress = bobKeypair.address()

    const toBobAmount = utils.parseEther('0.06')
    const toBobUtxo = new Utxo({ amount: toBobAmount, keypair: Keypair.fromString(bobAddress) })
    const aliceBalChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(toBobAmount),
      keypair: aliceDepositUtxo.keypair,
    })

    await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [toBobUtxo, aliceBalChangeUtxo] })
    const bobBalUtxo = new Utxo({
      amount: toBobAmount,
      keypair: bobKeypair,
      blinding: toBobUtxo.blinding,
    })
    const bobRecipient = '0xaaaaaaaaaa000000000000000000000000000000'
    await transaction({
      tornadoPool,
      inputs: [bobBalUtxo],
      recipient: bobRecipient,
    })

    const aliceRecipient = '0xeeeeeeeeee000000000000000000000000000000'
    await transaction({
      tornadoPool,
      inputs: [aliceBalChangeUtxo], 
      recipient: aliceRecipient,
      isL1Withdrawal: true,
    })

    const bobRecipientBal = await token.balanceOf(bobRecipient)
    expect(bobRecipientBal).to.be.equal(utils.parseEther('0.06'))

    const aliceRecipientBal = await token.balanceOf(aliceRecipient)
    expect(aliceRecipientBal).to.be.equal(0)

    const omniBridgeBal = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBal).to.be.equal(utils.parseEther('0.07'))

    const poolBal = await token.balanceOf(tornadoPool.address)
    expect(poolBal).to.be.equal(0)    
  })
})
