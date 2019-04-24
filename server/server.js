
const moment = require('moment')
const express = require('express')
const fetch = require('node-fetch')

const SimplexNoise = require('simplex-noise')
const Voronoi = require('voronoi')
const Seedrandom = require('seedrandom')
const THREE = require('three')

const config = require('./config')
const merkleTools = require('./utils/merkleTools')

const app = express()
const port = process.env.PORT || 5000

// firebase
const admin = require('firebase-admin')

const serviceAccount = require('./auth/' + config.FBFilename)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'webgl-gource-1da99.appspot.com'
})

const firebaseDB = admin.firestore()
const docRef = firebaseDB.collection('bitcoin_blocks')
const docRefGeo = firebaseDB.collection('bitcoin_blocks_geometry')
const docRefProgress = firebaseDB.collection('bitcoin_progress')
const docRefUpdate = firebaseDB.collection('bitcoin_update')

const planeSize = 500

const map = (n, a, b, x, y) => x + (n - a) * (y - x) / (b - a)

let voronoi

const cacheBlockData = async function (height) {
  try {
    let block

    let blockData = await fetch('https://blockchain.info/block-height/' + height + '?cors=true&format=json&apiCode=' + config.blockchainInfo.apiCode)
    let blockDataJSON = await blockData.json()
    block = blockDataJSON.blocks[0]

    block.tx.forEach(function (tx) {
      let txValue = 0
      tx.out.forEach((output) => {
        txValue += output.value
      })
      tx.value = txValue
    })

    // sortTXData(block.tx)

    let outputTotal = 0
    let transactions = []

    for (let i = 0; i < block.n_tx; i++) {
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

      spentRatio = spentRatio.toFixed(2)

      if (typeof tx.value === 'undefined') {
        tx.value = 0
      }

      transactions.push({
        index: tx.tx_index,
        time: tx.time,
        value: tx.value,
        spentRatio: spentRatio,
        outputCount: outputCount
      })

      outputTotal += tx.value
    }

    block.outputTotal = outputTotal
    block.tx = transactions
    block.cacheTime = new Date()

    block.healthRatio = (block.fee / block.outputTotal) * 2000 // 0 == healthy

    block.healthRatio = block.healthRatio.toFixed(2)

    // save to firebase
    try {
      await docRef.doc(block.hash).set(block, { merge: false })
      console.log('Block data for: ' + block.hash + ' successfully written!')
      await createMerkleCircuit(block.hash)
    } catch (error) {
      console.log(error)
    }
    return block
  } catch (error) {
    console.log(error)
  }
}

const saveGeometry = async function (blockData) {
  console.log('Block geo data: ' + blockData.hash + ' does not exist in the db, adding...')
  let pointCount = Math.max(blockData.n_tx, 4)

  const simplex = new SimplexNoise(blockData.height)

  voronoi = new Voronoi()

  let sites = []

  let prng = new Seedrandom(blockData.height)

  for (let index = 0; index < pointCount; index++) {
    let found = false
    let x = 0
    let y = 0

    while (found === false) {
      x = Math.floor(prng() * planeSize - (planeSize / 2))
      y = Math.floor(prng() * planeSize - (planeSize / 2))

      let noiseVal = simplex.noise2D(x / 300, y / 300)

      if (((prng() * 5) * noiseVal) > -0.3) {
        let exists = false
        for (let existsIndex = 0; existsIndex < sites.length; existsIndex++) {
          const site = sites[existsIndex]
          if (site.x === x && site.y === y) {
            exists = true
            break
          }
        }
        if (!exists) {
          found = true
        }
      }
    }
    sites.push({x: x, y: y})
  }

  let voronoiDiagram = voronoi.compute(sites, {
    xl: -planeSize / 2,
    xr: planeSize / 2,
    yt: -planeSize / 2,
    yb: planeSize / 2
  })

  // work out network health
  let feeToValueRatio = 0
  if (blockData.outputTotal !== 0) {
    feeToValueRatio = blockData.fee / blockData.outputTotal
  }

  let blockHealth = map(feeToValueRatio, 0, 0.0001, 20, 0)
  if (blockHealth < 0) {
    blockHealth = 0
  }

  let relaxIterations = Math.round(blockHealth)

  if (blockData.n_tx > 1) {
    for (let index = 0; index < relaxIterations; index++) {
      try {
        voronoiDiagram = relaxSites(voronoiDiagram)
      } catch (error) {
        console.log(error)
      }
    }
  }

  let offsets = new THREE.InstancedBufferAttribute(new Float32Array(blockData.n_tx * 2), 2)
  let scales = new THREE.InstancedBufferAttribute(new Float32Array(blockData.n_tx), 1)

  for (let i = 0; i < blockData.n_tx; i++) {
    // if (typeof blockData.tx[i] === 'undefined') {
    //   continue
    // }
    let cell = voronoiDiagram.cells[i]

    let site = new THREE.Vector2(cell.site.x, cell.site.y)

    // look at all adjacent cells and get the closest site to this site
    let minDistToSite = Number.MAX_SAFE_INTEGER

    cell.halfedges.forEach((halfEdge) => {
      if (halfEdge.edge.rSite !== null) {
        let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.rSite.x, halfEdge.edge.rSite.y).distanceToSquared(site)
        if (distanceToSiteSq > 0) {
          minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
        }
      }
      if (halfEdge.edge.lSite !== null) {
        let distanceToSiteSq = new THREE.Vector2(halfEdge.edge.lSite.x, halfEdge.edge.lSite.y).distanceToSquared(site)
        if (distanceToSiteSq > 0) {
          minDistToSite = Math.min(minDistToSite, distanceToSiteSq)
        }
      }
    })

    let radius = Math.sqrt(minDistToSite) * 0.5

    let planeXEdgeDist = (planeSize / 2) - Math.abs(site.x)
    let planeYEdgeDist = (planeSize / 2) - Math.abs(site.y)

    if (planeXEdgeDist < radius) {
      radius = planeXEdgeDist
    }
    if (planeYEdgeDist < radius) {
      radius = planeYEdgeDist
    }

    offsets.setXY(
      i,
      site.x,
      site.y
    )

    scales.setX(
      i,
      radius
    )
  }

  let geoData = {
    offsets: offsets.array,
    scales: scales.array
  }

  try {
    await docRefGeo.doc(blockData.hash).set({
      offsets: JSON.stringify(geoData.offsets),
      scales: JSON.stringify(geoData.scales),
      height: blockData.height
    }, { merge: true })
    console.log('Geo data for block: ' + blockData.hash + ' successfully written')
  } catch (error) {
    console.log('Error writing document: ', error)
  }
  return geoData
}

const getLatestAddedHeight = async function () {
// first check firebase
  let heightRef = docRefProgress
    .orderBy('height', 'desc')
    .limit(1)

  let heightSnapshot = await heightRef.get()

  let latestHeight = 0
  heightSnapshot.forEach(async snapshot => {
    latestHeight = snapshot.data().height
  })

  return latestHeight
}

const blockUpdateRoutine = async function () {
  let latestHeight = await getLatestAddedHeight() + 1

  let blockRef = docRef
    .where('height', '==', latestHeight)
    .limit(1)
  let blockSnapshot = await blockRef.get()

  let err = false

  if (blockSnapshot.size === 0) {
    console.log('Adding block at height: ' + latestHeight)

    try {
      let blockDataHeight = await fetch('https://blockchain.info/block-height/' + latestHeight + '?format=json&apiCode=' + config.blockchainInfo.apiCode)
      let blockDataJSON = await blockDataHeight.json()
      let block = blockDataJSON.blocks[0]

      // first check firebase
      let blockRef = docRef.doc(block.hash)
      let snapshot = await blockRef.get()

      let blockData

      // block data not found
      if (!snapshot.exists) {
        blockData = await cacheBlockData(block.height)
      } else {
        blockData = snapshot.data()
      }

      // check for geo data in cache
      let blockRefGeo = docRefGeo.doc(block.hash)
      let snapshotGeo = await blockRefGeo.get()

      if (!snapshotGeo.exists) {
        saveGeometry(blockData)
      }
    } catch (error) {
      console.log(error)
      err = true
    }
  }

  if (!err) {
    // update progress
    try {
      await docRefProgress.doc('height').set({
        height: latestHeight
      }, { merge: true })
    } catch (error) {
      console.log('Error writing document: ', error)
    }
    blockUpdateRoutine()
  } else {
    setTimeout(() => {
      blockUpdateRoutine()
    }, 100000)
  }
}

const asyncForEach = async function (array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

// script to run periodically to update the db with latest blocks
app.get('/api2/updateDB', (req, res) => {
  blockUpdateRoutine()

  res.send({ express: 'Updating...' })
})

// script to run periodically to update historical block data
app.get('/api2/updateChangedBlocks', async (req, res) => {
  // get array of blocks to update
  let ref = docRefUpdate.limit(1)
  let snapshots = await ref.get()
  snapshots.forEach(async snapshot => {
    let heights = snapshot.data().heights
    await asyncForEach(heights, async (height) => {
      await cacheBlockData(height)
    })
  })

  await docRefUpdate.doc('heights').set({heights: []}, { merge: false })

  res.send({ express: 'Updating...' })
})

const createMerkleCircuit = async function (hash) {
  let canvasSize = 1024
  const { createCanvas } = require('canvas')
  const canvas = createCanvas(canvasSize, canvasSize)

  let blockRef = docRef.doc(hash)
  let snapshot = await blockRef.get()
  let blockData = snapshot.data()

  let blockRefGeo = docRefGeo.doc(hash)
  let snapshotGeo = await blockRefGeo.get()
  let blockOffsets = JSON.parse(snapshotGeo.data().offsets)

  merkleTools.drawMerkleCanvas(canvas, blockData, blockData.n_tx, canvasSize, blockOffsets)

  const {Storage} = require('@google-cloud/storage')
  const storage = new Storage({
    keyFilename: './auth/' + config.FBFilename,
    projectId: 'webgl-gource-1da99.appspot.com'
  })

  let bucket = storage.bucket('webgl-gource-1da99.appspot.com')
  let file = bucket.file('bitcoin_circuits' + '/' + hash + '.png')

  file.exists().then((data) => {
    let exists = data[0]

    if (!exists) {
      const canvasBuffer = canvas.toBuffer()

      const blobStream = file.createWriteStream({
        metadata: {
          contentType: 'image/png'
        }
      })

      blobStream.on('error', (error) => {
        console.log(error)
      })

      blobStream.on('finish', () => {
        console.log('file uploaded')
        return true
      })

      blobStream.end(canvasBuffer)
    } else {
      console.log('file exists')
    }
  })
}

app.get('/api2/canvas', async (req, res) => {
  await createMerkleCircuit('000000001cf4dddb159bdd979833f3163c24cc345adba71ddddd5e57717182b5')
  res.send('Generating Merkle Circuit Image...')
})

app.listen(port, () => console.log(`Listening on port ${port}`))

// Lloyds relaxation methods: http://www.raymondhill.net/voronoi/rhill-voronoi-demo5.html
const cellArea = function (cell) {
  let area = 0
  let halfedges = cell.halfedges
  let halfedgeIndex = halfedges.length
  let halfedge
  let startPoint
  let endPoint

  while (halfedgeIndex--) {
    halfedge = halfedges[halfedgeIndex]
    startPoint = halfedge.getStartpoint()
    endPoint = halfedge.getEndpoint()
    area += startPoint.x * endPoint.y
    area -= startPoint.y * endPoint.x
  }

  return area / 2
}

const cellCentroid = function (cell) {
  let x = 0
  let y = 0
  let halfedges = cell.halfedges
  let halfedgeIndex = halfedges.length
  let halfedge
  let v
  let startPoint
  let endPoint

  while (halfedgeIndex--) {
    halfedge = halfedges[halfedgeIndex]
    startPoint = halfedge.getStartpoint()
    endPoint = halfedge.getEndpoint()
    let vector = startPoint.x * endPoint.y - endPoint.x * startPoint.y
    x += (startPoint.x + endPoint.x) * vector
    y += (startPoint.y + endPoint.y) * vector
  }

  v = cellArea(cell) * 6

  return {
    x: x / v,
    y: y / v
  }
}

const relaxSites = function (diagram) {
  let cells = diagram.cells
  let cellIndex = cells.length
  let cell
  let site
  let sites = []
  let rn
  let dist

  let p = 1 / cellIndex * 0.1

  while (cellIndex--) {
    cell = cells[cellIndex]
    rn = Math.random()

    site = cellCentroid(cell)

    dist = new THREE.Vector2(site.x, site.y).distanceTo(new THREE.Vector2(cell.site.x, cell.site.y))

    if (isNaN(dist)) {
      console.log('NaN')
      continue
    }

    // don't relax too fast
    if (dist > 2) {
      site.x = (site.x + cell.site.x) / 2
      site.y = (site.y + cell.site.y) / 2
    }

    // probability of mytosis
    if (rn > (1 - p)) {
      dist /= 2
      sites.push({
        x: site.x + (site.x - cell.site.x) / dist,
        y: site.y + (site.y - cell.site.y) / dist
      })
    }

    sites.push(site)
  }

  diagram = voronoi.compute(sites, {
    xl: -planeSize / 2,
    xr: planeSize / 2,
    yt: -planeSize / 2,
    yb: planeSize / 2
  })

  return diagram
}
