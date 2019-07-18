# [Symphony 2.0](https://symphony.iohk.io)

![Symphony](https://symphony.iohk.io/static/assets/images/day-view.jpg)

Symphony 2.0 is a **real-time, 3D, immersive blockchain explorer.**

Symphony 2.0 aims to answer the question **what does a blockchain look and sound like?**

It is an **educational initiative** with the aim of **inspiring a wide audience about blockchain technology**.

## Visual Structures

In Symphony 2.0 all of the 3D structures represent real components of a blockchain.

### Transactions

Transactions are represented as hexagonal crystals. The height of each crystal is based on the transaction value. The brightness of the crystal surface is based on the ratio of unspent to spent transaction outputs, see [Bitcoin UTXO](https://learnmeabitcoin.com/glossary/utxo). Fully spent transactions appear darker in color than unspent transactions.

## Blocks

The arrangement of crystals on the block surface and the crystal radii is controlled by a [2D Simplex Noise function](https://en.wikipedia.org/wiki/Simplex_noise). The noise amplitude is controlled by the ratio of total block transaction fees to total block value. We use this metric as a type of "Network Health". If the transaction fees are very high compared to the transaction amounts, we consider this an unhealthy state. An unhealthy state is visually reflected by transactions being more random in radius and spacing.

### Merkle Trees

![Symphony](https://symphony.iohk.io/static/assets/images/block-angle.jpg)


[Merkle Trees](https://en.wikipedia.org/wiki/Merkle_tree) are a fundamental component of blockchains and decentralized applications. They allow efficient verification of large data sets. In bitcoin and other cryptocurrencies, Merkle Trees connect one block to the next. They are constructed from hashes of the block transactions. In Symphony 2.0 we show how the branches of the trees connect to the transactions on the top of the block.

### Mempool

In Symphony 2.0 the [Mempool](https://99bitcoins.com/bitcoin/mempool/#mempool) is visualised as a swirling cloud of particles at the center of the blockchain spiral. The total count of particles is controlled by the actual mempool size.

### Spent Transactions

We show transaction outputs being spent via a trail of energy leaving the transaction crystal and flying toward the mempool.

### Blockchain

The macro blockchain structure is shown as an [archimedean spiral](https://en.wikipedia.org/wiki/Archimedean_spiral). This structure is an efficient use of space for showing the entire blockchain on screen.


## Sound Synthesis

Symphony 2.0 generates a unique soundscape for each block based on the block data using [Additive Synthesis](https://en.wikipedia.org/wiki/Additive_synthesis). It loops through each of the transactions in a block and converts the transaction values to pitch (larger transaction value = lower pitch). Each transaction has a fundamental pitch as well as 7 [harmonics](https://en.wikipedia.org/wiki/Harmonic). It utilises [GPU.js](https://github.com/gpujs/gpu.js) to generate the sound buffers quickly. We use the ratio of the transaction fee to value as an indicator of "Transaction Health". If a transaction has a very high fee to value ratio, we add randomness to the harmonics, creating a more sonically inharmonic sound.

The sound in Symphony 2.0 serves a functional purpose - you can listen to the sound of a block and ascertain properties about the number of transactions, the level of fees in the block and the value being moved around.


## Installation

```bash
yarn install && yarn start
```

### License

Symphony 2.0 is licensed under the [Apache-2.0](./LICENSE.md) licence.
