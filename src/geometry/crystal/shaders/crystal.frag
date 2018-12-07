#pragma glslify: noise = require('glsl-noise/simplex/4d');
#pragma glslify: random = require('../../../shaders/random')
#pragma glslify: truchetPattern = require('../../../shaders/truchetPattern')

#define PHYSICAL

uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
uniform float uTime;
uniform float uCamPosYPositive;

varying float vIsSelected;
varying float vIsHovered;
varying vec3 vBarycentric;
varying vec3 vTransformed;
varying float vScale;
varying float vTopVertex;
varying float vBottomVertex;
// varying float vCenterTopVertex;
// varying float vCenterBottomVertex;
varying float vEnvelope;
varying vec4 vWorldPosition;

#ifndef STANDARD
	uniform float clearCoat;
	uniform float clearCoatRoughness;
#endif

varying vec3 vViewPosition;
varying float vSpentRatio;

// #ifndef FLAT_SHADED

	varying vec3 vNormal;

// #endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
// #include <alphamap_pars_fragment>
// #include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
// #include <emissivemap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
// #include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
//#include <roughnessmap_pars_fragment>
//#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	#include <clipping_planes_fragment>

	// vec2 dt = fwidth(vUv) * 50.0;
	// float maxDerivative = clamp(max(dt.t, dt.s), 0.0, 1.0);
	//maxDerivative *= maxDerivative;

	float d = min(min(vBarycentric.x, vBarycentric.y), vBarycentric.z);
	float edgeAmount = (pow(clamp( (1.0 - d), 0.9, 1.0), 4.0) * 1.0);

	float sideEdgeAmount = edgeAmount * ((1.0-(vBottomVertex * 0.7)));

	vec3 diffuseVar = vec3( clamp( vEnvelope, 0.0, 4.0  ) );
	
	vec4 diffuseColor = vec4( diffuseVar + sideEdgeAmount, opacity);

	#include <normal_fragment_begin>

	vec3 normalSmooth = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normalSmooth = normalSmooth * ( float( gl_FrontFacing ) * 2.0 - 1.0 );
	#endif


	#include <normal_fragment_maps>

	diffuseColor.rgb *= packNormalToRGB( normal + 0.6 );

	vec3 dispersion = diffuseColor.rgb * packNormalToRGB( normalSmooth + 0.8 );

	diffuseColor.rgb = mix(diffuseColor.rgb, dispersion, 0.3);

	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

	vec3 totalEmissiveRadiance = vec3(clamp(((vEnvelope )), 0.0, 2.5) * 0.6);

	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	// #include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>

	// #include <emissivemap_fragment>

	// accumulation
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>

	#include <lights_fragment_maps>
	#include <lights_fragment_end>

	// modulation
	#include <aomap_fragment>

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

	float noiseAmount = noise(vec4(vTransformed.xyz / (vScale * 5.0), uTime * 0.00025)) * 0.1;

	outgoingLight += noiseAmount * 0.5;

	vec2 st = (vec2((vUv.x * vScale * 5.0), vTransformed.y) * 0.5);
	vec2 ipos = floor(st);  // integer
	vec2 fpos = fract(st);  // fraction

	vec2 tile = truchetPattern(fpos, random( ipos ) * uTime * 0.00005);

	// Maze
	float tileColor = 0.0;
	tileColor = smoothstep(tile.x-0.3, tile.x, tile.y)-
			smoothstep(tile.x, tile.x+0.3, tile.y);

	// further smoothing    
	tileColor -= smoothstep(tile.x+0.3,tile.x,0.0)-
			smoothstep(tile.x,tile.x-0.3,-0.15);
	
	tileColor -= smoothstep(tile.y+0.3,tile.y,0.0)-
			smoothstep(tile.y,tile.y-0.3,-0.15);
	
	tileColor -= smoothstep(tile.x+0.3,tile.x,1.15)-
			smoothstep(tile.x,tile.x-0.3,1.0);
	
	tileColor -= smoothstep(tile.y+0.3,tile.y,1.15)-
			smoothstep(tile.y,tile.y-0.3,1.0);

	float absNoise = abs(noiseAmount) * 15.0;
	float tileNoiseColor = (pow(tileColor, 3.0) * 2.0) * absNoise;

	

	//float noiseTileMix = mix(tileNoiseColor, 1.0, pow(maxDerivative, 2.0)) * ((1.0 - maxDerivative) * 2.0);


	outgoingLight.b += (tileNoiseColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex));
	outgoingLight.g += (tileNoiseColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex)) * 0.3;

	outgoingLight += smoothstep(0.7, 1.0, edgeAmount) * 0.05;

	//outgoingLight += 0.05;
	//outgoingLight.r += (1.0-vSpentRatio) * 0.2;

	vec3 colorMix = mix( 
		mix(vec3(211./255., 3./255., 236./255.), outgoingLight, 0.9), 
		mix(vec3(0./255., 134./255., 239./255.), outgoingLight, 0.9), 
		vSpentRatio
	);

	outgoingLight = colorMix;


	outgoingLight += vIsHovered * (sideEdgeAmount * 1.2);
	outgoingLight += vIsSelected * (sideEdgeAmount * 1.2);
	outgoingLight += (1.0 - step(sideEdgeAmount , 0.95)) * 1.2 * vIsHovered;
	outgoingLight += (1.0 - step(sideEdgeAmount , 0.95)) * 1.2 * vIsSelected;

	outgoingLight += packNormalToRGB(normal - normalize(vViewPosition) ) * 0.025;
	//outgoingLight += packNormalToRGB(normal ) * 0.1;

	if (vWorldPosition.y < 0.0) {
		diffuseColor.a *= 0.8;
	}
	diffuseColor.a *= smoothstep(-60.0, 0.0, vWorldPosition.y);

	gl_FragColor = vec4( outgoingLight, diffuseColor.a);

	#include <tonemapping_fragment>
	#include <encodings_fragment>

	#ifdef USE_FOG

		#ifdef FOG_EXP2

			float fogFactor = whiteCompliment( exp2( - fogDensity * fogDensity * fogDepth * fogDepth * LOG2 ) );

		#else

			float fogFactor = smoothstep( fogNear, fogFar, fogDepth );

		#endif

		gl_FragColor.a = mix( gl_FragColor.a, 0.0, fogFactor );

	#endif

	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
	

}