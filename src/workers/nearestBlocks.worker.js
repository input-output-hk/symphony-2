import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'

import BlockHeightHelper from '../helpers/BlockHeightHelper'

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const blockHeightHelper = new BlockHeightHelper({
        baseUrl: 'https://us-central1-webgl-gource-1da99.cloudfunctions.net/cors-proxy?url=',
        apiCode: data.config.blockchainInfo.apiCode
      })

      firebase.initializeApp(data.config.fireBase)

      firebase.firestore()
      const firebaseDB = firebase.firestore()
      const docRef = firebaseDB.collection('bitcoin_blocks')
      const docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')

      let closestBlocksData = {}
      let closestBlocksGeoData = {}

      let blockGeoData = docRefGeo
        .where('height', '>', data.closestHeight - 5)
        .where('height', '<', data.closestHeight + 5)
        .orderBy('height', 'asc')

      let geoSnapshot = await blockGeoData.get()

      geoSnapshot.forEach(snapshot => {
        let data = snapshot.data()

        let offsetJSON = JSON.parse(data.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(data.scales)
        let scalesArray = Object.values(scalesJSON)

        let blockData = data

        blockData.offsets = offsetsArray
        blockData.scales = scalesArray

        closestBlocksGeoData[data.height] = data
      })

      let blockData = docRef
        .where('height', '>', data.closestHeight - 5)
        .where('height', '<', data.closestHeight + 5)
        .orderBy('height', 'asc')

      let querySnapshot = await blockData.get()

      querySnapshot.forEach(snapshot => {
        let data = snapshot.data()
        closestBlocksData[data.height] = data
      })

      // check for missing blockdata entries which were too big to cache

      await asyncForEach(Object.keys(closestBlocksGeoData), async (height) => {
        if (typeof closestBlocksData[height] === 'undefined') {
          console.log('block at height ' + height + ' is missing from db')
          let block = await blockHeightHelper.populateData(height)
          closestBlocksData[height] = block
        }
      })

      let returnData = {
        closestBlocksData: closestBlocksData,
        closestBlocksGeoData: closestBlocksGeoData
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

const asyncForEach = async function (array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}
