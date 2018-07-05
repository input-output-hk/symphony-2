
import * as THREE from 'three'

export default class VoronoiTools {
  constructor (voronoi, blockHeight, planeSize) {
    Math.seedrandom(blockHeight)
    this.voronoi = voronoi
    this.planeSize = planeSize
  }

  // Lloyds relaxation methods: http://www.raymondhill.net/voronoi/rhill-voronoi-demo5.html
  cellArea (cell) {
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

  cellCentroid (cell) {
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

    v = this.cellArea(cell) * 6

    return {
      x: x / v,
      y: y / v
    }
  }

  relaxSites (diagram) {
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

      site = this.cellCentroid(cell)

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

    diagram = this.voronoi.compute(sites, {
      xl: -this.planeSize / 2,
      xr: this.planeSize / 2,
      yt: -this.planeSize / 2,
      yb: this.planeSize / 2
    })

    return diagram
  }
}
