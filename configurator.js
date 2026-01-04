import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

let scene, camera, renderer, controls;
let currentModel = null;
let frontPanelMesh = null;
let decalMesh = null;
let currentMode = 'printed';
let currentFinish = 'powder';

const FINISH_PRESETS = {
    'powder': {
        name: 'Powder-Coated Steel',
        base: { roughness: 0.55, metalness: 0.85, normalScale: 1.0 },
        engraved: { roughness: 0.68, metalness: 0.78, normalScale: 1.12, colorMult: 1.0 }
    },
    'raw': {
        name: 'Raw / Weathered Steel',
        base: { roughness: 0.65, metalness: 0.80, normalScale: 1.0 },
        engraved: { roughness: 0.78, metalness: 0.70, normalScale: 1.15, colorMult: 0.9 } // Darker
    },
    'corten': {
        name: 'Corten / Rusted Steel',
        base: { roughness: 0.75, metalness: 0.65, normalScale: 1.0 },
        engraved: { roughness: 0.88, metalness: 0.55, normalScale: 1.18, colorMult: 1.0 }
    },
    'brushed': {
        name: 'Brushed Stainless Steel',
        base: { roughness: 0.35, metalness: 0.95, normalScale: 1.0 },
        engraved: { roughness: 0.48, metalness: 0.88, normalScale: 1.10, colorMult: 1.0 }
    },
    'painted': {
        name: 'Painted / Matte Metal',
        base: { roughness: 0.70, metalness: 0.60, normalScale: 1.0 },
        engraved: { roughness: 0.82, metalness: 0.52, normalScale: 1.10, colorMult: 1.0 }
    }
};

// Shared material for the decal
// We use MeshStandardMaterial to respond to light
const decalMaterial = new THREE.MeshStandardMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4, // Ensure it sits on top of the panel
    side: THREE.FrontSide,
    color: 0xffffff
});

export async function init(containerId) {
    const container = document.getElementById(containerId);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1d20');

    // Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(1.5, 1.0, 3.0); // Closer view as requested

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.useLegacyLights = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.target.set(0, 0.5, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-5, 2, -5);
    scene.add(fillLight);

    // Animation Loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

export function resize() {
    if (!camera || !renderer) return;
    const container = renderer.domElement.parentElement;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

export function resetCamera() {
    if (controls) {
        controls.reset();
        camera.position.set(1.5, 1.0, 3.0);
    }
}

export function loadModel(modelKey) {
    if (currentModel) {
        scene.remove(currentModel);
        // Clean up
        currentModel.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            }
        });
        currentModel = null;
        frontPanelMesh = null;
        removeDecals();
    }

    const loader = new GLTFLoader();
    const fileName = modelKey === 'radiant' ? 'Radiant3D.glb' : 'Bloom3D.glb';

    // Paths to try
    const paths = [
        `./public/models/${fileName}`, // GitHub Pages / Raw Structure
        `/models/${fileName}`,         // Vite / Root Serve
        `models/${fileName}`           // Relative fallback
    ];

    function tryLoad(index) {
        if (index >= paths.length) {
            console.error('All model paths failed for:', fileName);
            return;
        }

        const path = paths[index];
        loader.load(path, (gltf) => {
            currentModel = gltf.scene;
            scene.add(currentModel);

            // Auto-center
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            currentModel.position.x += (currentModel.position.x - center.x);
            currentModel.position.y += (currentModel.position.y - center.y);
            currentModel.position.z += (currentModel.position.z - center.z);

            console.log('Model Loaded:', modelKey, 'from', path);

            // Find Front Panel
            currentModel.traverse((child) => {
                if (child.isMesh) {
                    // Heuristic for Front Panel
                    if (!frontPanelMesh && (child.name.includes('Front') || child.name.includes('Panel') || child.name.includes('Body'))) {
                        frontPanelMesh = child;
                        console.log('Selected Front Panel:', child.name);
                    }
                }
            });

            // Fallback Front Panel
            if (!frontPanelMesh) {
                currentModel.traverse(child => {
                    if (child.isMesh && !frontPanelMesh) {
                        frontPanelMesh = child;
                        console.log('Fallback Front Panel:', child.name);
                    }
                });
            }

        }, undefined, (error) => {
            console.warn(`Failed to load model from ${path}, trying next path...`);
            tryLoad(index + 1);
        });
    }

    // Start loading
    tryLoad(0);
}

function removeDecals() {
    if (decalMesh) {
        scene.remove(decalMesh);
        if (decalMesh.geometry) decalMesh.geometry.dispose();
        decalMesh = null;
    }
}

// Store texture for mode switching
let activeTexture = null;

export function updateTexture(sourceCanvas) {
    if (!frontPanelMesh) return;

    removeDecals();

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true; // Correct upside down issue

    activeTexture = texture; // Save for mode switches

    // Determine Decal Placement
    // We assume the Front Panel faces +Z relative to the model center, or we inspect normals.
    // Robust approach: Raycast from Front (+Z) towards Center.
    const box = new THREE.Box3().setFromObject(frontPanelMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Raycast from slightly in front of the center
    const raycaster = new THREE.Raycaster();

    // Offset the ray origin by 50% of width to the right (X axis) (User requested 50%)
    // And UP by 25% (Y axis)
    const offsetRel = new THREE.Vector3(size.x * 0.50, size.y * 0.25, 0);

    // Start Ray from OUTSIDE the model bounds.
    // We add Z offset to be "in front" as well, but since we are at the edge (X=50%), 
    // we should ensure we are sufficiently "out" radially.
    // Simply adding large Z and casting towards center is reliable for convex shapes.
    const rayOrigin = center.clone().add(offsetRel).add(new THREE.Vector3(0, 0, size.z));

    // Cast towards the CENTER of the bounding box (or object center)
    // This ensures we hit the surface regardless of its angle (0, 45, 90 deg).
    const direction = center.clone().sub(rayOrigin).normalize();

    raycaster.set(rayOrigin, direction);

    const intersects = raycaster.intersectObject(frontPanelMesh, false);

    let position = center.clone().add(offsetRel); // Default to offset center
    let orientation = new THREE.Euler();

    // Scale decal to fit nicely (e.g. fit within ONE panel of the octagon)
    // User requested another +30% size increase (Total approx +69% from base).
    // 0.455 * 1.3 = 0.5915
    // 0.65 * 1.3 = 0.845
    const decalSize = new THREE.Vector3(size.x * 0.5915, size.y * 0.845, 0.2);

    if (intersects.length > 0) {
        const hit = intersects[0];
        position.copy(hit.point);

        // Align to face normal
        const n = hit.face.normal.clone();
        n.transformDirection(frontPanelMesh.matrixWorld).normalize();

        // Create a dummy object to help with rotation
        const helper = new THREE.Object3D();
        helper.position.copy(position);
        helper.lookAt(position.clone().add(n));
        orientation.copy(helper.rotation);
    } else {
        // Fallback
        console.warn('Decal raycast failed, falling back to offset placement');
        position.z += size.z / 2;
    }

    // Apply Mode Properties
    applyMaterialMode(texture);

    // Create Geometry
    const geometry = new DecalGeometry(frontPanelMesh, position, orientation, decalSize);

    decalMesh = new THREE.Mesh(geometry, decalMaterial);
    scene.add(decalMesh);
}

export function setFinish(finishId) {
    if (!FINISH_PRESETS[finishId]) return;
    currentFinish = finishId;

    // Update Base Panel Material
    if (frontPanelMesh && frontPanelMesh.material) {
        const preset = FINISH_PRESETS[currentFinish].base;
        frontPanelMesh.material.roughness = preset.roughness;
        frontPanelMesh.material.metalness = preset.metalness;
        // Optimization: preserve existing normal map if present, just update scale? 
        // User said: "Normal map: reuse base normal", so we just tweak normalScale if it exists
        if (frontPanelMesh.material.normalScale) {
            frontPanelMesh.material.normalScale.set(preset.normalScale, preset.normalScale);
        }
    }

    // Re-apply decal material logic if it exists
    if (decalMesh && activeTexture) {
        applyMaterialMode(activeTexture);
    }
}

export function setMode(mode) {
    currentMode = mode;
    if (decalMesh && activeTexture) {
        applyMaterialMode(activeTexture);
    }
}

function applyMaterialMode(texture) {
    // Check if we have original material to copy from
    const baseMat = frontPanelMesh ? frontPanelMesh.material : null;

    // Default properties from original if available, else defaults
    const baseColor = baseMat ? baseMat.color.clone() : new THREE.Color(0xffffff);

    // Use preset values for base panel reference
    const finishPreset = FINISH_PRESETS[currentFinish] || FINISH_PRESETS['powder'];


    decalMaterial.needsUpdate = true;

    if (currentMode === 'engraved') {
        const p = finishPreset.engraved;

        // Remove color map, use texture as ALPHA map for the shape
        decalMaterial.map = null;
        decalMaterial.alphaMap = texture;

        // Match base color BUT slightly modified for some materials (Simple simulation of "Darker" for Raw Steel)
        decalMaterial.color.copy(baseColor);
        if (p.colorMult && p.colorMult !== 1.0) {
            decalMaterial.color.multiplyScalar(p.colorMult);
        }

        // Apply Preset Properties
        decalMaterial.roughness = p.roughness;
        decalMaterial.metalness = p.metalness;

        // Ensure transparent
    } else {
        // Printed Mode: Standard overlay
        decalMaterial.map = texture;
        decalMaterial.alphaMap = null; // Don't use alpha mask logic, rely on texture's own alpha

        // Printed usually sits on top, opaque or semi-opaque inks. 
        // We'll use white base so the texture colors show true.
        decalMaterial.color.setHex(0xffffff);
        decalMaterial.roughness = 0.4;
        decalMaterial.metalness = 0.0;
    }
}
