#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: applyQuaternionToVector = require('../../../shaders/applyQuaternionToVector')
#pragma glslify: rotationMatrix = require('../../../shaders/rotationMatrix')
#pragma glslify: random = require('../../../shaders/random)

#define PHYSICAL

uniform float uTime;
uniform float uAudioTime;
uniform vec3 uCamPos;
uniform float uAutoPilot;
uniform vec2 uOriginOffset;
uniform float uCamPosYPositive;

attribute float isHovered;
attribute float isSelected;
attribute vec3 pickerColor;
attribute vec3 offset;
attribute float scale;
attribute float spentRatio;
attribute vec3 barycentric;
attribute float topVertex;
attribute float txValue;
attribute vec4 quaternion;
attribute float txTime;
attribute float blockStartTime;
attribute float blockLoadTime;

varying float vIsHovered;
varying float vIsSelected;
varying vec3 vViewPosition;
varying vec3 vTransformed;
varying float vScale;
varying float vSpentRatio;
varying vec3 vBarycentric;
varying float vTopVertex;
varying float vBottomVertex;
varying float vEnvelope;
varying vec3 vPickerColor;
varying vec4 vWorldPosition;

// #ifndef FLAT_SHADED

	varying vec3 vNormal;

// #endif

#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

void main() {

	vPickerColor = pickerColor;

	vIsHovered = isHovered;
	vIsSelected = isSelected;

	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>

	#include <beginnormal_vertex>
	
	#include <defaultnormal_vertex>

//#ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED

	vNormal = normalize( transformedNormal );

//#endif

	#include <begin_vertex>

	float offsetTime = uAudioTime - blockStartTime;
	float loadTime = uAudioTime - blockLoadTime;

	// envelope
	float attack = smoothstep(txTime, txTime + 2.0, offsetTime * 0.001);
	float release = (1.0 - smoothstep(txTime + 2.0, txTime + 4.0, offsetTime * 0.001));

	float attackLoad = smoothstep(txTime, txTime + 5.0, loadTime * 0.001);

	float blockActive = (blockStartTime == 0.0) ? 0.0 : 1.0;

	vEnvelope = (attack * release) * blockActive;

	transformed.xyz = applyQuaternionToVector( quaternion, transformed.xyz );
	vec3 originalTransform = transformed.xyz;

	transformed.xz *= ((scale * attackLoad)  * 1.07);
	// transformed.xz *= scale;

	transformed.y *= ((offset.y+ (3.0 * vEnvelope)) * attackLoad);
	transformed.y *= 2.0;

	if (uCamPosYPositive != 1.0) {
		//transformed.y += (offset.y * 0.5) * attackLoad;
		transformed.y = max(transformed.y, 0.2) * topVertex;
	}

	// transformed.y += (1.0 * isSelected);

	// transformed.y += abs(sin( (uTime*0.0005) )) * 5.0 * isSelected;
	mat4 rotation = rotationMatrix(offset.xyz * vec3(0.0,1.0,0.0), (uTime*0.0002) * isSelected);

	vec4 newPos = rotation * vec4( transformed, 1.0 );

	transformed.xyz = newPos.xyz;

    transformed.xz += offset.xz;

	// vec2 distVec = transformed.xz - uCamPos.xz;

	// if (uAutoPilot > 0.0) {
	// 	float camDistSq = dot(distVec, distVec);
	// 	transformed.y *= smoothstep(0.0, 10000.0, camDistSq);
	// }

		
    transformed.xz -= (uOriginOffset.xy);

	vTransformed = transformed;
	vTopVertex = topVertex;
	vBottomVertex = 1.0 - topVertex;
	vScale = scale;

	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>

	vViewPosition = - mvPosition.xyz;

	vSpentRatio = spentRatio;

	vBarycentric = barycentric;

	#include <worldpos_vertex>
	vWorldPosition = worldPosition;

	#include <shadowmap_vertex>
	#include <fog_vertex>

}
