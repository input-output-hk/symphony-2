#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')


uniform float uTime;
uniform vec2 uOriginOffset;

attribute vec3 offset;
attribute vec4 quaternion;
attribute float topVertex;

varying float vTopVertex;

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <skinbase_vertex>

	#ifdef USE_ENVMAP

	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>

	#endif

	#include <begin_vertex>

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );

    transformed.y += offset.y;
    transformed.xz += (offset.xz - uOriginOffset);

	vec2 toCenterVec = normalize(-offset.xz) * (mod(uTime, 30000.0) * 20.0);
	transformed.xz += toCenterVec;


	vTopVertex = topVertex;

	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>

	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>

}
