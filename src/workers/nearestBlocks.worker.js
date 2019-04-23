import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'
// import 'firebase/storage'
import * as ArrayUtils from '../utils/array'

import moment from 'moment'

import BlockDataHelper from '../helpers/BlockDataHelper'

let firebaseDB
let docRef
let docRefGeo
let docRefUpdate

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      let blockHeightIndexes = data.blockHeightIndexes
      let geoBlockHeightIndexes = data.geoBlockHeightIndexes

      firebase.initializeApp(data.config.fireBase)

      firebase.firestore()
      firebaseDB = firebase.firestore()
      docRef = firebaseDB.collection('bitcoin_blocks')
      docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')
      docRefUpdate = firebaseDB.collection('bitcoin_update')

      firebase.auth().signInAnonymously().catch(function (error) {
        console.log(error.code)
        console.log(error.message)
      })

      let blockDataHelper = new BlockDataHelper({
        config: data.config
      })

      let closestBlocksData = {}

      let blockGeoData = docRefGeo
        .where('height', '>', data.closestHeight - 5)
        .where('height', '<', data.closestHeight + 5)
        .orderBy('height', 'asc')
        .limit(9)

      let geoSnapshot = await blockGeoData.get()

      let i = 0
      geoSnapshot.forEach(snapshot => {
        let geoData = snapshot.data()

        let offsetJSON = JSON.parse(geoData.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(geoData.scales)
        let scalesArray = Object.values(scalesJSON)

        geoBlockHeightIndexes[i] = geoData.height

        scalesArray.forEach((scale, index) => {
          data['scales' + i][index] = scale
        })

        offsetsArray.forEach((offset, index) => {
          data['offsets' + i][index] = offset
        })

        i++
      })

      let blockData = docRef
        .where('height', '>', data.closestHeight - 5)
        .where('height', '<', data.closestHeight + 5)
        .orderBy('height', 'asc')
        .limit(9)

      let querySnapshot = await blockData.get()

      let dataArr = []
      querySnapshot.forEach(async snapshot => {
        dataArr.push(snapshot.data())
      })

      let ii = 0
      await ArrayUtils.asyncForEach(dataArr, async (blockDetails) => {
        if (moment().valueOf() - blockDetails.cacheTime.toMillis() > 604800000) {
          // console.log('Block: ' + blockDetails.hash + ' is out of date, marked for update')
          let snapshots = await docRefUpdate.get()
          let heightsToUpdate = []
          snapshots.forEach(snapshot => {
            let updateDataArr = snapshot.data()
            heightsToUpdate = updateDataArr.heights
          })
          if (heightsToUpdate.indexOf(blockDetails.height) === -1) {
            heightsToUpdate.push(blockDetails.height)
          }
          if (heightsToUpdate.length > 0) {
            await docRefUpdate.doc('heights').set({heights: heightsToUpdate}, { merge: false })
          }
        }

        if (blockDetails.tx[0].index === 0) {
          // console.log('Block: ' + blockDetails.hash + ' data incomplete, marked for update')
          let snapshots = await docRefUpdate.get()
          let heightsToUpdate = []
          snapshots.forEach(snapshot => {
            let updateDataArr = snapshot.data()
            heightsToUpdate = updateDataArr.heights
          })
          if (heightsToUpdate.indexOf(blockDetails.height) === -1) {
            heightsToUpdate.push(blockDetails.height)
          }
          if (heightsToUpdate.length > 0) {
            await docRefUpdate.doc('heights').set({heights: heightsToUpdate}, { merge: false })
          }
        }

        blockHeightIndexes[ii] = blockDetails.height

        // if (updatedBlockDetails !== null) {
        //   blockDetails = updatedBlockDetails
        // }

        blockDetails.tx.forEach((tx, index) => {
          data['txValues' + ii][index] = tx.value
          data['txIndexes' + ii][index] = tx.index
          data['txSpentRatios' + ii][index] = tx.spentRatio
        })

        blockDetails.tx = []

        closestBlocksData[blockDetails.height] = blockDetails

        ii++
      })

      let returnData = {
        closestBlocksData: closestBlocksData,

        blockHeightIndexes: blockHeightIndexes,
        geoBlockHeightIndexes: geoBlockHeightIndexes,

        scales0: data.scales0,
        scales1: data.scales1,
        scales2: data.scales2,
        scales3: data.scales3,
        scales4: data.scales4,
        scales5: data.scales5,
        scales6: data.scales6,
        scales7: data.scales7,
        scales8: data.scales8,

        offsets0: data.offsets0,
        offsets1: data.offsets1,
        offsets2: data.offsets2,
        offsets3: data.offsets3,
        offsets4: data.offsets4,
        offsets5: data.offsets5,
        offsets6: data.offsets6,
        offsets7: data.offsets7,
        offsets8: data.offsets8,

        txValues0: data.txValues0,
        txValues1: data.txValues1,
        txValues2: data.txValues2,
        txValues3: data.txValues3,
        txValues4: data.txValues4,
        txValues5: data.txValues5,
        txValues6: data.txValues6,
        txValues7: data.txValues7,
        txValues8: data.txValues8,

        txIndexes0: data.txIndexes0,
        txIndexes1: data.txIndexes1,
        txIndexes2: data.txIndexes2,
        txIndexes3: data.txIndexes3,
        txIndexes4: data.txIndexes4,
        txIndexes5: data.txIndexes5,
        txIndexes6: data.txIndexes6,
        txIndexes7: data.txIndexes7,
        txIndexes8: data.txIndexes8,

        txSpentRatios0: data.txSpentRatios0,
        txSpentRatios1: data.txSpentRatios1,
        txSpentRatios2: data.txSpentRatios2,
        txSpentRatios3: data.txSpentRatios3,
        txSpentRatios4: data.txSpentRatios4,
        txSpentRatios5: data.txSpentRatios5,
        txSpentRatios6: data.txSpentRatios6,
        txSpentRatios7: data.txSpentRatios7,
        txSpentRatios8: data.txSpentRatios8
      }

      self.postMessage(returnData,
        [
          data.scales0.buffer,
          data.scales1.buffer,
          data.scales2.buffer,
          data.scales3.buffer,
          data.scales4.buffer,
          data.scales5.buffer,
          data.scales6.buffer,
          data.scales7.buffer,
          data.scales8.buffer,

          data.offsets0.buffer,
          data.offsets1.buffer,
          data.offsets2.buffer,
          data.offsets3.buffer,
          data.offsets4.buffer,
          data.offsets5.buffer,
          data.offsets6.buffer,
          data.offsets7.buffer,
          data.offsets8.buffer,

          data.txValues0.buffer,
          data.txValues1.buffer,
          data.txValues2.buffer,
          data.txValues3.buffer,
          data.txValues4.buffer,
          data.txValues5.buffer,
          data.txValues6.buffer,
          data.txValues7.buffer,
          data.txValues8.buffer,

          data.txIndexes0.buffer,
          data.txIndexes1.buffer,
          data.txIndexes2.buffer,
          data.txIndexes3.buffer,
          data.txIndexes4.buffer,
          data.txIndexes5.buffer,
          data.txIndexes6.buffer,
          data.txIndexes7.buffer,
          data.txIndexes8.buffer,

          data.txSpentRatios0.buffer,
          data.txSpentRatios1.buffer,
          data.txSpentRatios2.buffer,
          data.txSpentRatios3.buffer,
          data.txSpentRatios4.buffer,
          data.txSpentRatios5.buffer,
          data.txSpentRatios6.buffer,
          data.txSpentRatios7.buffer,
          data.txSpentRatios8.buffer
        ]
      )
      break
    case 'stop':
      self.postMessage('WORKER STOPPED')
      self.close()
      break
    default:
      self.postMessage('Unknown command')
  }

  // self.postMessage(e.data)
}, false)
