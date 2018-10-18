import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'
import moment from 'moment'
import { map } from '../utils/math'

let config = {}

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      config = data.config

      firebase.initializeApp(config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)
      const firebaseDB = firebase.firestore()
      const docRef = firebaseDB.collection('bitcoin_blocks')

      // first check firebase
      let blockRef = docRef.doc(data.hash)
      let snapshot = await blockRef.get()

      let blockData
      let shouldCache = false

      if (!snapshot.exists) {
        shouldCache = true
      } else {
        blockData = snapshot.data()
        // check if block was cached more than a day ago
        if (moment().valueOf() - blockData.cacheTime.toMillis() > 86400000) {
          console.log('Block: ' + data.hash + ' is out of date, re-adding')
          shouldCache = true
        }
      }

      if (!shouldCache) {
        console.log('Block data for: ' + data.hash + ' returned from cache')
      } else {
        blockData = await cacheBlockData(data.hash, docRef)
      }

      let returnData = {
        blockData: blockData
      }

      self.postMessage(returnData)
      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }

  self.postMessage(e.data)
}, false)

const cacheBlockData = async function (hash, docRef) {
  return new Promise((resolve, reject) => {
    fetch('https://blockchain.info/rawblock/' + hash + '?cors=true&apiCode=' + config.blockchainInfo.apiCode)
      .then((resp) => resp.json())
      .then(function (block) {
        block.tx.forEach(function (tx, index) {
          let txValue = 0
          tx.out.forEach((output, index) => {
            txValue += output.value
          })
          tx.value = txValue
        })

        // sortTXData(block.tx)

        let outputTotal = 0
        let transactions = []

        const txCount = block.tx.length

        block.txTimes = []

        for (let i = 0; i < block.tx.length; i++) {
          const tx = block.tx[i]

          let out = []
          tx.out.forEach((output) => {
            out.push({
              spent: output.spent ? 1 : 0
            })
          })

          if (typeof tx.value === 'undefined') {
            tx.value = 0
          }

          transactions.push({
            hash: tx.hash,
            time: tx.time,
            value: tx.value,
            out: out
          })

          outputTotal += tx.value

          let txTime = map(i, 0, txCount, 0, 20)
          block.txTimes.push(txTime)
        }

        block.outputTotal = outputTotal
        block.tx = transactions
        block.cacheTime = new Date()

        block.healthRatio = (block.fee / block.outputTotal) * 2000 // 0 == healthy

        // save to firebase
        docRef.doc(block.hash).set(
          block, { merge: false }
        ).then(function () {
          console.log('Block data for: ' + block.hash + ' successfully written!')
        }).catch(function (error) {
          console.log('Error writing document: ', error)
        })

        resolve(block)
      })
  })
}
