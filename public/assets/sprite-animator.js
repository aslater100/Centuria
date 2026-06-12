/**
 * Sprite Animation System
 * Handles idle loops, work cycles, and movement animations
 */

class SpriteAnimator {
  constructor(spriteGenerator) {
    this.gen = spriteGenerator;
    this.animations = {};
    this.frameIndex = 0;
    this.frameTime = 0;
  }

  /**
   * Create an idle animation (breathing, slight sway)
   */
  idleAnimation(spriteType, params = {}) {
    const key = `idle-${spriteType}`;
    
    if (spriteType === 'settler') {
      // Breathing/standing idle
      const frames = [];
      for (let i = 0; i < 4; i++) {
        const canvas = this.gen.settler(params.gender || 'male', params.skin || 0, params.hair || 0);
        frames.push(canvas);
      }
      return {
        frames,
        frameRate: 8, // 8 frames per second = 0.5s cycle
        loop: true,
        type: 'idle',
      };
    }
    
    if (spriteType === 'livestock') {
      const frames = [];
      for (let i = 0; i < 3; i++) {
        const canvas = this.gen.livestock(params.type || 'cow', i);
        frames.push(canvas);
      }
      return {
        frames,
        frameRate: 6,
        loop: true,
        type: 'idle',
      };
    }
    
    if (spriteType === 'wildAnimal') {
      const frames = [];
      for (let i = 0; i < 3; i++) {
        const canvas = this.gen.wildAnimal(params.type || 'deer', i);
        frames.push(canvas);
      }
      return {
        frames,
        frameRate: 8,
        loop: true,
        type: 'idle',
      };
    }
    
    if (spriteType === 'grainPlant') {
      const frames = [];
      for (let stage = 1; stage <= 3; stage++) {
        const canvas = this.gen.grainPlant(stage);
        frames.push(canvas);
      }
      return {
        frames,
        frameRate: 2, // Slow growth cycle
        loop: true,
        type: 'growth',
      };
    }
    
    if (spriteType === 'tree') {
      const frames = [];
      for (let stage = 1; stage <= 3; stage++) {
        const canvas = this.gen.tree(stage, params.variant || 0);
        frames.push(canvas);
      }
      return {
        frames,
        frameRate: 1, // Very slow growth
        loop: true,
        type: 'growth',
      };
    }
    
    return { frames: [], frameRate: 10, loop: true };
  }

  /**
   * Work animation (farming, mining, crafting)
   */
  workAnimation(workType, params = {}) {
    const frames = [];
    
    if (workType === 'farming') {
      // Settler swinging tool
      for (let i = 0; i < 6; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        ctx.fillStyle = '#7a8c54';
        ctx.fillRect(0, 0, 32, 48);
        
        // Body
        ctx.fillStyle = '#d4a574';
        ctx.beginPath();
        ctx.ellipse(16, 12, 6, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#4a3a2c';
        ctx.beginPath();
        ctx.ellipse(16, 9, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#6b5138';
        ctx.fillRect(10, 20, 12, 16);
        
        // Swinging arm with tool
        const angle = (i / 6) * Math.PI;
        const armX = 22 + Math.cos(angle) * 8;
        const armY = 22 + Math.sin(angle) * 8;
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#d4a574';
        ctx.beginPath();
        ctx.moveTo(22, 22);
        ctx.lineTo(armX, armY);
        ctx.stroke();
        
        // Tool head
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(armX - 2, armY - 2, 4, 4);
        
        frames.push(canvas);
      }
      
      return {
        frames,
        frameRate: 8,
        loop: true,
        type: 'work',
      };
    }
    
    if (workType === 'mining') {
      // Swinging pickaxe
      for (let i = 0; i < 4; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        ctx.fillStyle = '#787469';
        ctx.fillRect(0, 0, 32, 48);
        
        // Body in mining stance
        ctx.fillStyle = '#d4a574';
        ctx.beginPath();
        ctx.ellipse(16, 14, 6, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#6b5138';
        ctx.fillRect(8, 22, 14, 14);
        
        // Pickaxe swing
        const swingAngle = (i / 4) * Math.PI * 1.5 - Math.PI / 4;
        const pickX = 16 + Math.cos(swingAngle + Math.PI / 4) * 12;
        const pickY = 16 + Math.sin(swingAngle + Math.PI / 4) * 12;
        
        ctx.strokeStyle = '#6b5138';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(16, 16);
        ctx.lineTo(pickX, pickY);
        ctx.stroke();
        
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(pickX - 2, pickY - 2, 4, 4);
        
        frames.push(canvas);
      }
      
      return {
        frames,
        frameRate: 6,
        loop: true,
        type: 'work',
      };
    }
    
    return { frames: [], frameRate: 10, loop: true };
  }

  /**
   * Movement animation (walking, running)
   */
  movementAnimation(movementType, params = {}) {
    const frames = [];
    
    if (movementType === 'walk') {
      // Walking settler
      for (let i = 0; i < 4; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        
        ctx.fillStyle = '#7a8c54';
        ctx.fillRect(0, 0, 32, 48);
        
        // Head
        ctx.fillStyle = '#d4a574';
        ctx.beginPath();
        ctx.ellipse(16, 12, 6, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#4a3a2c';
        ctx.beginPath();
        ctx.ellipse(16, 9, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Body
        ctx.fillStyle = '#6b5138';
        ctx.fillRect(10, 20, 12, 16);
        
        // Walking legs
        const legPhase = (i % 4) / 4;
        
        // Left leg
        const leftLegX = 12 + Math.sin(legPhase * Math.PI * 2) * 2;
        const leftLegY = 20 + Math.abs(Math.cos(legPhase * Math.PI * 2)) * 6;
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3d586b';
        ctx.beginPath();
        ctx.moveTo(12, 36);
        ctx.lineTo(leftLegX, 46);
        ctx.stroke();
        
        // Right leg
        const rightLegX = 20 - Math.sin(legPhase * Math.PI * 2) * 2;
        const rightLegY = 20 + Math.abs(Math.cos((legPhase + 0.5) * Math.PI * 2)) * 6;
        
        ctx.beginPath();
        ctx.moveTo(20, 36);
        ctx.lineTo(rightLegX, 46);
        ctx.stroke();
        
        frames.push(canvas);
      }
      
      return {
        frames,
        frameRate: 8,
        loop: true,
        type: 'movement',
      };
    }
    
    return { frames: [], frameRate: 10, loop: true };
  }

  /**
   * Render animation frame at a given time
   */
  render(animation, timeMs = 0) {
    if (!animation.frames || animation.frames.length === 0) {
      return null;
    }
    
    const frameDuration = 1000 / animation.frameRate;
    let frameIndex = Math.floor(timeMs / frameDuration) % animation.frames.length;
    
    return animation.frames[frameIndex];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpriteAnimator;
}
