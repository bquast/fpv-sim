import * as THREE from './lib/three.module.min.js';

let scene, camera, renderer, clock;
const keys = {};
const buildings = [];
const traffic = []; 
let targetCar, targetBeam, gateArrow;
let score = 0;

// Physics Constants - Heavy Quad Model
const GRAVITY = 16.0;      
const THRUST_MAX = 45.0;   
const DRAG = 0.05;         
const ANGULAR_RATE = 4.5; 
const ALT_HOLD_STRENGTH = 9.0; 

const drone = {
    position: new THREE.Vector3(0, 15, 60),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    throttle: 0.38,
    width: 0.6
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(50, 100, 50);
    scene.add(sun);

    // --- Ground ---
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 128; groundCanvas.height = 128;
    const gCtx = groundCanvas.getContext('2d');
    gCtx.fillStyle = '#111'; gCtx.fillRect(0,0,128,128);
    gCtx.strokeStyle = '#333'; gCtx.lineWidth = 2; gCtx.strokeRect(0,0,128,128);
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(100, 100);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ map: groundTex }));
    ground.rotateX(-Math.PI/2);
    scene.add(ground);

    // --- Building Texture & Generation ---
    const buildCanvas = document.createElement('canvas');
    buildCanvas.width = 64; buildCanvas.height = 64;
    const bCtx = buildCanvas.getContext('2d');
    bCtx.fillStyle = '#444'; bCtx.fillRect(0,0,64,64);
    bCtx.fillStyle = '#222'; bCtx.fillRect(10,10,15,15); bCtx.fillRect(40,10,15,15);
    const buildTex = new THREE.CanvasTexture(buildCanvas);
    buildTex.wrapS = buildTex.wrapT = THREE.RepeatWrapping;

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 70; i++) {
        const h = 15 + Math.random() * 40;
        const w = 12 + Math.random() * 8;
        const building = new THREE.Mesh(boxGeo, new THREE.MeshPhongMaterial({ map: buildTex }));
        building.scale.set(w, h, w);
        building.position.set((Math.random()-0.5)*500, h/2, (Math.random()-0.5)*500);
        building.updateMatrixWorld(); // Ensure bounding box is accurate
        buildings.push(building);
        scene.add(building);
    }

    // --- Target Object (The Red Car) ---
    const carGeo = new THREE.BoxGeometry(4, 1.5, 2);
    const targetMat = new THREE.MeshPhongMaterial({ color: 0x990000 });
    targetCar = new THREE.Mesh(carGeo, targetMat);
    scene.add(targetCar);

    // Depth Indication: Vertical Light Beam
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 500);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    targetBeam = new THREE.Mesh(beamGeo, beamMat);
    scene.add(targetBeam);

    spawnTarget();

    // --- HUD Components ---
    const arrowGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
    gateArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    gateArrow.rotation.x = Math.PI / 2;
    gateArrow.position.set(0, 0.6, -2);
    camera.add(gateArrow);
    
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6), new THREE.MeshBasicMaterial({ color: 0x000 }));
    rod.rotation.x = Math.PI/2.2; rod.position.set(0, -0.4, -0.4);
    camera.add(rod);
    scene.add(camera);

    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    animate();
}

function spawnTarget() {
    let validPos = false;
    let attempts = 0;
    const testBox = new THREE.Box3();

    while (!validPos && attempts < 100) {
        const x = (Math.random()-0.5) * 400;
        const z = (Math.random()-0.5) * 400;
        const y = 0.75; // Ground level for a car
        
        targetCar.position.set(x, y, z);
        testBox.setFromObject(targetCar);

        // Check against all buildings
        let collision = false;
        for(let b of buildings) {
            if (testBox.intersectsBox(new THREE.Box3().setFromObject(b))) {
                collision = true;
                break;
            }
        }

        if (!collision) validPos = true;
        attempts++;
    }

    // Sync the depth beam to car position
    targetBeam.position.set(targetCar.position.x, 250, targetCar.position.z);
}

function updatePhysics(dt) {
    if (keys['KeyW']) drone.rotation.x -= ANGULAR_RATE * dt;
    if (keys['KeyS']) drone.rotation.x += ANGULAR_RATE * dt;
    if (keys['KeyA']) drone.rotation.z += ANGULAR_RATE * dt;
    if (keys['KeyD']) drone.rotation.z -= ANGULAR_RATE * dt;
    if (keys['ArrowLeft']) drone.rotation.y += ANGULAR_RATE * dt;
    if (keys['ArrowRight']) drone.rotation.y -= ANGULAR_RATE * dt;

    if (keys['ArrowUp']) drone.throttle = Math.min(drone.throttle + 1.8 * dt, 1.0);
    else if (keys['ArrowDown']) drone.throttle = Math.max(drone.throttle - 1.8 * dt, 0.0);

    const up = new THREE.Vector3(0, 1, 0).applyEuler(drone.rotation);
    const thrust = up.multiplyScalar(drone.throttle * THRUST_MAX);
    
    // Improved Alt Hold logic
    if (Math.abs(drone.throttle - 0.4) < 0.05 && drone.velocity.y < 0) {
        thrust.y += ALT_HOLD_STRENGTH * (drone.position.y < 5 ? 1.5 : 1.0) * dt;
    }

    const netForce = thrust.add(new THREE.Vector3(0, -GRAVITY, 0));
    drone.velocity.add(netForce.multiplyScalar(dt));
    drone.velocity.multiplyScalar(1 - DRAG);
    drone.position.add(drone.velocity.clone().multiplyScalar(dt));

    // Collision Logic
    if (drone.position.y < 0.3) resetDrone();
    const droneBox = new THREE.Box3().setFromCenterAndSize(drone.position, new THREE.Vector3(0.5,0.5,0.5));
    for(let b of buildings) {
        if (droneBox.intersectsBox(new THREE.Box3().setFromObject(b))) {
            resetDrone();
            break;
        }
    }

    // Target Capture Check
    if (drone.position.distanceTo(targetCar.position) < 5) {
        score++;
        spawnTarget();
    }

    camera.position.copy(drone.position);
    camera.quaternion.setFromEuler(drone.rotation);
    gateArrow.lookAt(targetCar.position);
    
    document.getElementById('alt').innerText = `${drone.position.y.toFixed(1)}m | HITS: ${score}`;
    document.getElementById('spd').innerText = `${(drone.velocity.length() * 3.6).toFixed(0)}km/h`;
    if (keys['KeyR']) resetDrone();
}

function resetDrone() {
    drone.position.set(0, 15, 60);
    drone.velocity.set(0, 0, 0);
    drone.rotation.set(0, 0, 0);
    drone.throttle = 0.38;
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics(clock.getDelta());
    renderer.render(scene, camera);
}

init();