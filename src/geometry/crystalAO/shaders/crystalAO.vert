#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')

uniform float uTime;
uniform float uAudioTime;
uniform float uFirstLoop;
uniform vec2 uOriginOffset;

attribute vec3 offset;
attribute float scale;
attribute float spentRatio;
attribute float txValue;
attribute vec4 quaternion;
attribute float txTime;
attribute float blockStartTime;
attribute float blockLoadTime;

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
	#include <begin_vertex>
	
	float offsetTime = uAudioTime - blockStartTime;
	float loadTime = uAudioTime - blockLoadTime;

	// envelope
	// float attack = smoothstep(txTime, txTime + 5.0, offsetTime * 0.001);
	// float release = (1.0 - smoothstep(txTime + 5.0, txTime + 10.0, offsetTime * 0.001));
	// float attackLoad = smoothstep(txTime, txTime + 5.0, loadTime * 0.001);

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );
   	transformed.xz *= (scale * 2.7);
	transformed.xz += (offset.xz - uOriginOffset.xy);

	#include <project_vertex>
	#include <logdepthbuf_vertex>

	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>

}
