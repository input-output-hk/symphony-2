export const webGL2 = true//renderer => (typeof WebGL2RenderingContext !== 'undefined' && renderer.getContext() instanceof WebGL2RenderingContext)

export const depthTexture = true//renderer => !!renderer.extensions.get('WEBGL_depth_texture')

export const multiRenderTargets = true//renderer => !!renderer.extensions.get('WEBGL_draw_buffers')