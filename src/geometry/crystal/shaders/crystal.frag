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

varying float vIsHovered;
varying vec3 vBarycentric;
varying vec3 vTransformed;
varying float vScale;
varying float vTopVertex;
varying float vBottomVertex;
// varying float vCenterTopVertex;
// varying float vCenterBottomVertex;
varying float vEnvelope;

#ifndef STANDARD
	uniform float clearCoat;
	uniform float clearCoatRoughness;
#endif

varying vec3 vViewPosition;
varying float vSpentRatio;
varying vec2 vPlaneOffset;

#ifndef FLAT_SHADED

	varying vec3 vNormal;

#endif

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

void main() {

	if (vPlaneOffset.x == 0.) {
		discard;
	} else {


		#include <clipping_planes_fragment>

		// vec2 dt = fwidth(vUv);
		// vec2 dtFace = dt * 200.0;
		// float maxDerivativeFace = clamp(max(dtFace.t, dtFace.s), 0.0, 1.0);

		float d = min(min(vBarycentric.x, vBarycentric.y), vBarycentric.z);
		float edgeAmount = (pow(clamp( (1.0 - d), 0.9, 1.0), 3.0) * 1.0);

		// vec2 dtEdge = dt * 10.0;
		// float maxDerivativeEdge = clamp(max(dtEdge.t, dtEdge.s), 0.0, 1.0);
		// edgeAmount *= 1.0-maxDerivativeEdge;

		vec3 diffuseVar = vec3( clamp( max(0.1, 1.0-vSpentRatio) + vEnvelope, 0.0, 1.3  )  );
		
		vec4 diffuseColor = vec4( diffuseVar + edgeAmount, opacity);

		//diffuseColor -= clamp(d, 0.99, 1.0) * vIsHovered ;

		ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

		vec3 totalEmissiveRadiance = vec3(clamp((1.0-vSpentRatio + (vEnvelope )), 0.0, 2.5) * 0.2);

		#include <logdepthbuf_fragment>
		#include <map_fragment>
		#include <color_fragment>
		#include <alphamap_fragment>
		#include <alphatest_fragment>
		#include <roughnessmap_fragment>
		#include <metalnessmap_fragment>
		#include <normal_fragment_begin>
		#include <normal_fragment_maps>
		#include <emissivemap_fragment>

		// accumulation
		 #include <lights_physical_fragment>
		 #include <lights_fragment_begin>

		// GeometricContext geometry;

		// geometry.position = - vViewPosition;
		// geometry.normal = normal;
		// geometry.viewDir = normalize( vViewPosition );

		// IncidentLight directLight;

		// #if defined( RE_IndirectDiffuse )

		// 	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );

		// 	#if ( NUM_HEMI_LIGHTS > 0 )

		// 		#pragma unroll_loop
		// 		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

		// 			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );

		// 		}

		// 	#endif

		// #endif

		// #if defined( RE_IndirectSpecular )

		// 	vec3 radiance = vec3( 0.0 );
		// 	vec3 clearCoatRadiance = vec3( 0.0 );

		// #endif








		 #include <lights_fragment_maps>
		 #include <lights_fragment_end>

		// modulation
		#include <aomap_fragment>

			
		// float spentRatio = clamp(vSpentRatio, 0.0, 1.0);
		// totalEmissiveRadiance += (1.0 - (vSpentRatio * 0.01));
		//totalEmissiveRadiance *= 0.5;

		//totalEmissiveRadiance = clamp(totalEmissiveRadiance * (vEnvelope), 0.0, 0.7);
		//totalEmissiveRadiance *= (vEnvelope*2.0);



		vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;


		// float d = min(min(vBarycentric.x, vBarycentric.y), vBarycentric.z);
		// float edgeAmount = pow(clamp( (1.0 - d), 0.0, 1.0), 6.0) * 0.07;

		float noiseAmount = noise(vec4(vTransformed.xyz / (vScale * 5.0), uTime * 0.00025)) * 0.1;

		// outgoingLight += edgeAmount;
		outgoingLight += noiseAmount * 0.5;

		//  outgoingLight += 0.02;

		//  outgoingLight.b += 0.08;
		//  outgoingLight.g += 0.04;

		vec2 st = (vec2((vUv.x * vScale * 5.0), vTransformed.y) * 0.5);
		vec2 ipos = floor(st);  // integer
		vec2 fpos = fract(st);  // fraction

		vec2 tile = truchetPattern(fpos, random( ipos ) * uTime * 0.00005);



		// Maze
		float color = 0.0;
		color = smoothstep(tile.x-0.3, tile.x, tile.y)-
				smoothstep(tile.x, tile.x+0.3, tile.y);

		// further smoothing    
		color -= smoothstep(tile.x+0.3,tile.x,0.0)-
				smoothstep(tile.x,tile.x-0.3,-0.15);
		
		color -= smoothstep(tile.y+0.3,tile.y,0.0)-
				smoothstep(tile.y,tile.y-0.3,-0.15);
		
		color -= smoothstep(tile.x+0.3,tile.x,1.15)-
				smoothstep(tile.x,tile.x-0.3,1.0);
		
		color -= smoothstep(tile.y+0.3,tile.y,1.15)-
				smoothstep(tile.y,tile.y-0.3,1.0);

		// float finalColor = mix(color,1.0, maxDerivativeFace * 0.5) * (1.0- maxDerivativeFace * 0.7);


		float finalColor = color;
		finalColor *= abs(noiseAmount) * 15.0;

		finalColor = (clamp(finalColor, 0.0, 1.0) );


		outgoingLight.b += (finalColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex));
		outgoingLight.g += (finalColor * (1.0 - vTopVertex) * (1.0 - vBottomVertex)) * 0.3;

		outgoingLight += ((vIsHovered*0.1) * (edgeAmount*2.0));
		outgoingLight += (1.0-step(edgeAmount, 0.95)) * (vIsHovered*0.1);


		gl_FragColor = vec4( outgoingLight, diffuseColor.a + (abs(noiseAmount) * 1.0));

		#include <tonemapping_fragment>
		#include <encodings_fragment>
		#include <fog_fragment>
		#include <premultiplied_alpha_fragment>
		#include <dithering_fragment>
	}

}