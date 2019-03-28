import firebase from 'firebase/app'
import 'firebase/firestore'
import 'firebase/auth'

let retryCount = 0
const retryMax = 3

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const config = data.config
      const height = data.height

      let blockHash = await getBlockData(height, config)

      let returnData

      if (blockHash === '') {
        returnData = {
          error: 'Height not found in db'
        }
      } else {
        returnData = {
          hash: blockHash
        }
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
}, false)

const getBlockData = async function (height, config) {
  firebase.initializeApp(config.fireBase)
  firebase.firestore()
  const firebaseDB = firebase.firestore()
  const docRef = firebaseDB.collection('bitcoin_blocks')
  firebase.auth().signInAnonymously().catch(function (error) {
    console.log(error.code)
    console.log(error.message)
  })

  // try firebase first
  let blockData = docRef
    .where('height', '==', height)
    .limit(1)

  let snapshot = await blockData.get()

  let blockHash = ''

  snapshot.forEach(snapshot => {
    let data = snapshot.data()
    blockHash = data.hash
  })

  return blockHash
}
