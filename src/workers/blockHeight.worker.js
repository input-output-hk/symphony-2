
let retryCount = 0
const retryMax = 3

self.addEventListener('message', async function (e) {
  let data = e.data
  switch (data.cmd) {
    case 'get':

      const config = data.config
      const height = data.height

      let blockDataJSON = await getBlockData(height, config)

      let returnData

      if (blockDataJSON === null) {
        self.postMessage({error: 'Failed to get blockdata from API'})

        returnData = {
          error: 'Failed to get blockdata from API'
        }
      } else {
        returnData = {
          hash: blockDataJSON.blocks[0].hash
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
  const baseUrl = 'https://us-central1-webgl-gource-1da99.cloudfunctions.net/cors-proxy?url='
  let url = baseUrl + encodeURIComponent('https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + config.blockchainInfo.apiCode)

  try {
    let blockData = await fetch(url)
    let blockDataJSON = await blockData.json()

    return blockDataJSON
  } catch (error) {
    retryCount++

    if (retryCount > retryMax) {
      return null
    }

    setTimeout(() => {
      getBlockData()
    }, 3000)
  }
}
