import firebase from 'firebase/app'
import 'firebase/firestore'
// import 'firebase/auth'
// import 'firebase/storage'
import moment from 'moment'

import BlockDataHelper from '../helpers/BlockDataHelper'

let config = {}

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      config = data.config

      firebase.initializeApp(config.fireBase)

      firebase.firestore()
      const firebaseDB = firebase.firestore()
      const docRef = firebaseDB.collection('bitcoin_blocks')

      let blockDataHelper = new BlockDataHelper({
        config: config
      })

      // first check firebase
      let blockRef = docRef.doc(data.hash)
      let snapshot = await blockRef.get()

      let blockData
      let shouldCache = false

      if (!snapshot.exists) {
        shouldCache = true
      } else {
        blockData = snapshot.data()
        // check if block was cached more than a week ago
        if (moment().valueOf() - blockData.cacheTime.toMillis() > 604800000) {
          console.log('Block: ' + data.hash + ' is out of date, re-adding')
          shouldCache = true
        }
      }

      if (!shouldCache) {
        console.log('Block data for: ' + data.hash + ' returned from cache')
      } else {
        blockData = await blockDataHelper.cacheBlockData(data.hash, docRef)
      }

      if (typeof blockData === 'undefined') {
        let returnData = {
          error: 'Failed to get blockdata from API'
        }

        self.postMessage(returnData)
      } else {
        blockData.tx.forEach((tx, i) => {
          data.txValues[i] = tx.value
          data.txSpentRatios[i] = tx.spentRatio
          data.txIndexes[i] = tx.index
        })

        blockData.tx = []
      }

      let returnData = {
        blockData: blockData,
        txValues: data.txValues,
        txSpentRatios: data.txSpentRatios,
        txIndexes: data.txIndexes
      }

      self.postMessage(returnData, [
        data.txValues.buffer,
        data.txSpentRatios.buffer,
        data.txIndexes.buffer
      ])

      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }
}, false)
