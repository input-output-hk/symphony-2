import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
// import 'firebase/storage'

import moment from 'moment'

import BlockDataHelper from '../helpers/BlockDataHelper'

let firebaseDB
let docRef
let docRefGeo

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      firebase.initializeApp(data.config.fireBase)

      firebase.firestore()
      firebaseDB = firebase.firestore()
      docRef = firebaseDB.collection('bitcoin_blocks')
      docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')

      firebase.auth().signInAnonymously().catch(function (error) {
        console.log(error.code)
        console.log(error.message)
      })

      let blockDataHelper = new BlockDataHelper({
        config: data.config
      })

      let closestBlocksData = {}
      let closestBlocksGeoData = {}

      let blockGeoData = docRefGeo
        .where('height', '>', data.closestHeight - 5)
        .where('height', '<', data.closestHeight + 5)
        .orderBy('height', 'asc')
        .limit(10)

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
        .limit(10)

      console.time('nearest')
      let querySnapshot = await blockData.get()
      console.timeEnd('nearest')

      let dataArr = []
      querySnapshot.forEach(async snapshot => {
        let data = snapshot.data()
        dataArr.push(data)
      })

      await asyncForEach(dataArr, async (data) => {
        if (moment().valueOf() - data.cacheTime.toMillis() > 86400000) {
          console.log('Block: ' + data.hash + ' is out of date, re-adding')
          closestBlocksData[data.height] = await blockDataHelper.cacheBlockData(data.hash, docRef)
        } else {
          closestBlocksData[data.height] = data
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
