import axios from 'axios'

export const imageLoader = baseURL => axios.create({
  baseURL,
  responseType: 'blob',
  transformResponse: blob => {
    const image = new Image()
    image.crossOrigin = 'Anonymous'
    image.src = URL.createObjectURL( blob )
    return image
  }
})