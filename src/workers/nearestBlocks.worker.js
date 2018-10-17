import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/storage'

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'build':

      firebase.initializeApp(data.config.fireBase)

      const settings = {timestampsInSnapshots: true}
      firebase.firestore().settings(settings)
      const firebaseDB = firebase.firestore()
      const docRef = firebaseDB.collection('bitcoin_blocks')
      const docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')

      let closestBlocksData = []
      let closestBlocksGeoData = []

      let blockData = docRef
        .where('height', '>', data.closestHeight - 1)
        .where('height', '<', data.closestHeight + 1)
        .orderBy('height', 'asc')

      let querySnapshot = await blockData.get()

      querySnapshot.forEach(snapshot => {
        let data = snapshot.data()
        // if (typeof this.blockGeoDataObject[data.height] === 'undefined') {
        closestBlocksData.push(data)
        // }
      })

      let blockGeoData = docRefGeo
        .where('height', '>', data.closestHeight - 1)
        .where('height', '<', data.closestHeight + 1)
        .orderBy('height', 'asc')

      let geoSnapshot = await blockGeoData.get()

      geoSnapshot.forEach(snapshot => {
        let data = snapshot.data()

        // if (typeof this.blockGeoDataObject[data.height] === 'undefined') {
        let offsetJSON = JSON.parse(data.offsets)
        let offsetsArray = Object.values(offsetJSON)

        let scalesJSON = JSON.parse(data.scales)
        let scalesArray = Object.values(scalesJSON)

        let blockData = data

        blockData.offsets = offsetsArray
        blockData.scales = scalesArray

        closestBlocksGeoData.push(data)
        // }
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
