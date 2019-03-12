
export default class BlockDataHelper {
  constructor (args) {
    this.config = args.config
  }

  async cacheBlockData (hash, docRef) {
    try {
      let result = await fetch('https://blockchain.info/rawblock/' + hash + '?cors=true&apiCode=' + this.config.blockchainInfo.apiCode)
      let block = await result.json()

      block.tx.forEach(function (tx) {
        let txValue = 0
        tx.out.forEach((output) => {
          txValue += output.value
        })
        tx.value = txValue
      })

      // sortTXData(block.tx)

      let outputTotal = 0
      let transactions = []

      for (let i = 0; i < block.n_tx; i++) {
        const tx = block.tx[i]

        let spentCount = 0
        let outputCount = 0
        tx.out.forEach((output) => {
          if (output.spent === true) {
            spentCount++
          }
          outputCount++
        })

        let spentRatio = 1
        if (spentCount !== 0) {
          spentRatio = spentCount / outputCount
        } else {
          spentRatio = 0.0
        }

        spentRatio = spentRatio.toFixed(2)

        if (typeof tx.value === 'undefined') {
          tx.value = 0
        }

        transactions.push({
          index: tx.tx_index,
          time: tx.time,
          value: tx.value,
          spentRatio: spentRatio,
          outputCount: outputCount
        })

        outputTotal += tx.value
      }

      block.outputTotal = outputTotal
      block.tx = transactions
      block.cacheTime = new Date()

      block.healthRatio = (block.fee / block.outputTotal) * 2000 // 0 == healthy

      block.healthRatio = block.healthRatio.toFixed(2)

      // save to firebase
      try {
        await docRef.doc(block.hash).set(block, { merge: false })
        console.log('Block data for: ' + block.hash + ' successfully written!')
      } catch (error) {
        console.log(error)
      }
      return block
    } catch (error) {
      console.log(error)
    }
  }

  sortTXData (tx) {
    tx.sort(function (a, b) {
      let transactionValueA = 0
      a.out.forEach((output, index) => {
        transactionValueA += output.value
      })

      let transactionValueB = 0
      b.out.forEach((output, index) => {
        transactionValueB += output.value
      })

      return transactionValueA - transactionValueB
    })
  }
}
