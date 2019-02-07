import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
import 'firebase/storage'
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
        // check if block was cached more than a day ago
        if (moment().valueOf() - blockData.cacheTime.toMillis() > 86400000) {
          console.log('Block: ' + data.hash + ' is out of date, re-adding')
          shouldCache = true
        }
      }

      if (!shouldCache) {
        console.log('Block data for: ' + data.hash + ' returned from cache')
      } else {
        blockData = await blockDataHelper.cacheBlockData(data.hash, docRef)
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
