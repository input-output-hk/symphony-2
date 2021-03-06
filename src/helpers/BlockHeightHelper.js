export default class BlockHeightHelper {
  constructor (args) {
    this.baseUrl = args.baseUrl
    this.apiCode = args.apiCode
  }

  async populateData (height) {
    let url = this.baseUrl + encodeURIComponent('https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + this.apiCode)

    let blockData = await fetch(url)
    let blockDataJSON = await blockData.json()
    let block = blockDataJSON.blocks[0]

    block.tx.forEach(function (tx) {
      let txValue = 0
      tx.out.forEach((output) => {
        txValue += output.value
      })
      tx.value = txValue
    })

    let outputTotal = 0
    let transactions = []

    for (let i = 0; i < block.tx.length; i++) {
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

      if (typeof tx.value === 'undefined') {
        tx.value = 0
      }

      transactions.push({
        hash: tx.hash,
        time: tx.time,
        value: tx.value,
        spentRatio: spentRatio,
        outputCount: outputCount
      })

      outputTotal += tx.value
    }

    block.outputTotal = outputTotal
    block.tx = transactions

    block.healthRatio = (block.fee / block.outputTotal) * 2000 // 0 == healthy

    return block
  }
}
