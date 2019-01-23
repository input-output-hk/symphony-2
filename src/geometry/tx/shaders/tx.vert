#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')
#pragma glslify: snoise = require(glsl-noise/simplex/3d)

uniform float uTime;
uniform vec2 uOriginOffset;

uniform sampler2D positionTexture;

attribute vec2 offset;
attribute vec4 quaternion;
// attribute float topVertex;

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

	vec4 positionData = texture2D(positionTexture, offset.xy);

	if (positionData.w == 0.0) {
		transformed.xyz = vec3(0.0);
	} else {
    	transformed.xyz *= (positionData.w - 1.0);
		transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );

    	// transformed.y += offset.y;

		transformed.xyz += positionData.xyz;

		float noiseVal = snoise(transformed.xyz * 0.00005) * 1000.0;

		transformed.x += noiseVal;
		transformed.y += noiseVal;
		transformed.z += noiseVal;

		transformed.xz -= uOriginOffset;
	}

	//vTopVertex = topVertex;

	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>

	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>

}
