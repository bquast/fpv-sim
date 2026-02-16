import * as THREE from './lib/three.module.min.js';

let scene, camera, renderer, clock;
const keys = {};
const buildings = []; // Track buildings for collision

// Physics Constants
const GRAVITY = 9.81;
const THRUST_MAX = 35.0;
const DRAG = 0.015;
const ANGULAR_RATE = 4.0; 

// Drone State
const drone = {
    position: new THREE.Vector3(0, 15, 60),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    throttle: 0,
    width: 0.5 // Collision radius
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 10, 300);
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 200, 50);
    scene.add(sun);

    // --- Ground with Variation (Checkerboard) ---
    // We create a canvas texture for variation without external images
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a'; // Dark asphalt
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#333333'; // Lighter grid/cracks
    ctx.strokeRect(0, 0, 64, 64);
    
    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(200, 200);

    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshPhongMaterial({ map: groundTex });
    scene.add(new THREE.Mesh(groundGeo, groundMat));

    // --- City Generation & Collision Logic ---
    const citySize = 800;
    const step = 40;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    
    for (let x = -citySize/2; x < citySize/2; x += step) {
        for (let z = -citySize/2; z < citySize/2; z += step) {
            if (Math.random() > 0.65) {
                const h = 10 + Math.random() * 40;
                const w = 8 + Math.random() * 12;
                const building = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({ color: 0x555555 }));
                building.scale.set(w, h, w);
                building.position.set(x, h/2, z);
                
                // Create a bounding box for collision
                building.geometry.computeBoundingBox();
                buildings.push(building);
                scene.add(building);
            }
        }
    }

    // --- FPV Rod ---
    const rodGroup = new THREE.Group();
    const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.7),
        new THREE.MeshPhongMaterial({ color: 0x050505 })
    );
    rod.rotation.x = Math.PI / 2.1;
    rod.position.set(0, -0.45, -0.4);
    rodGroup.add(rod);
    camera.add(rodGroup);
    scene.add(camera);

    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    animate();
}

function resetDrone() {
    drone.position.set(0, 15, 60);
    drone.velocity.set(0, 0, 0);
    drone.rotation.set(0, 0, 0);
    drone.throttle = 0;
}

function checkCollisions() {
    // Ground Collision
    if (drone.position.y < 0.5) resetDrone();

    // Building Collision
    const droneBox = new THREE.Box3().setFromCenterAndSize(
        drone.position, 
        new THREE.Vector3(drone.width, drone.width, drone.width)
    );

    for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const buildingBox = new THREE.Box3().setFromObject(b);
        if (droneBox.intersectsBox(buildingBox)) {
            resetDrone();
            break;
        }
    }
}

function updatePhysics(dt) {
    if (keys['KeyW']) drone.rotation.x -= ANGULAR_RATE * dt;
    if (keys['KeyS']) drone.rotation.x += ANGULAR_RATE * dt;
    if (keys['KeyA']) drone.rotation.z += ANGULAR_RATE * dt;
    if (keys['KeyD']) drone.rotation.z -= ANGULAR_RATE * dt;
    if (keys['ArrowLeft']) drone.rotation.y += ANGULAR_RATE * dt;
    if (keys['ArrowRight']) drone.rotation.y -= ANGULAR_RATE * dt;

    if (keys['ArrowUp']) drone.throttle = Math.min(drone.throttle + 2.0 * dt, 1.0);
    else if (keys['ArrowDown']) drone.throttle = Math.max(drone.throttle - 2.0 * dt, 0.0);

    const up = new THREE.Vector3(0, 1, 0).applyEuler(drone.rotation);
    const thrust = up.multiplyScalar(drone.throttle * THRUST_MAX);
    const gravity = new THREE.Vector3(0, -GRAVITY, 0);
    
    drone.velocity.add(thrust.add(gravity).multiplyScalar(dt));
    drone.velocity.multiplyScalar(1 - DRAG);
    drone.position.add(drone.velocity.clone().multiplyScalar(dt));

    checkCollisions();

    camera.position.copy(drone.position);
    camera.quaternion.setFromEuler(drone.rotation);

    document.getElementById('alt').innerText = drone.position.y.toFixed(1);
    document.getElementById('spd').innerText = (drone.velocity.length() * 3.6).toFixed(0);
    
    if (keys['KeyR']) resetDrone();
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics(clock.getDelta());
    renderer.render(scene, camera);
}

init();