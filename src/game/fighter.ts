// Logique commune : vie et flash de dégât.
export class Fighter {
  hp: number;
  hitFlash = 0;

  constructor(readonly maxHp: number) {
    this.hp = maxHp;
  }

  get hpRatio(): number {
    return this.hp / this.maxHp;
  }

  damage(n: number): void {
    this.hp = Math.max(0, this.hp - n);
    this.hitFlash = 220;
  }

  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  tickFighter(dt: number): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }
}
