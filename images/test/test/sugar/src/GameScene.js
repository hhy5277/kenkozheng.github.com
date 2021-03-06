
var GameLayer = cc.Layer.extend({

    mapPanel:null,
    effectPanel:null,
    ui:null,


    /**
     * 本关卡的数据
     * ============================
     */
    score:0,
    level:0,
    steps:0,
    timeElapsed:0,
    sugarPopCount:null,
    chocolateMachine:null,
    /**
     * =============================
     */


    map:null,
    /**
     * 已选中的糖果
     */
    chosenSugars:null,

    /**
     * 以下属性都是点击糖果过程中，用于临时计算分数或效果的变量
     * ==============================
     */

    /**
     * 糖果还在移动，不接受再次点击
     */
    moving:false,
    /**
     * 本次（一次点击）消除，被扫中的条纹糖数目
     */
    popLineSugarsCount:0,
    /**
     * 本次消除，被扫中的包装糖数目
     */
    popBombSugarsCount:0,
    /**
     * {Array} 本轮消除的糖数（一轮概念：点击之后可能有特殊糖，特殊糖爆炸可能又引起特殊糖爆炸，这里分一轮一轮）
     */
    popSugarCount:null,
    /**
     * {Object} 本轮消除的特效糖统计
     */
    popSpecialSugarCount:null,
    /**
     * {Object} 本轮消除的障碍物统计
     */
    popBlockCount:null,
    /**
     * 点击的位置
     */
    popColumn:0,
    popRow:0,
    /**
     * 由特殊糖引起的多次爆炸，当前是第几轮。每次点击，此属性重置0
     */
    explodeRound:0,
    /**
     * 记录每一轮糖霜的被消除情况，防止重复消除
     */
    frostingDecreaseRecord:null,
    /**
     * 标记特殊糖爆炸过程中是否遇到甘草漩涡
     */
    hitWhirlpool:false,
    /**
     * 本轮点击是否消灭了巧克力
     */
    chocolateDeleted:false,
    /**
     * 点了道具按钮
     */
    usingPropId:0,
    /**
     * 由于玩家可以道具放宽限制，所以这里要复制一份出来
     */
    limitStep:0,
    limitTime:0,


    ctor:function (level) {
        this._super();

        var size = cc.winSize;
        cc.spriteFrameCache.addSpriteFrames("res/images/sugar.plist");

        var bg = new cc.Sprite("res/images/bg.jpg");
        this.addChild(bg, 1);
        bg.x = size.width/2;
        bg.y = size.height/2;

        var clippingPanel = new cc.ClippingNode();
        this.addChild(clippingPanel, 2);
        this.mapPanel = new cc.SpriteBatchNode("res/images/sugar.png");
        this.mapPanel.x = (size.width - Constant.SUGAR_WIDTH*Constant.MAP_SIZE)/2;
        this.mapPanel.y = (size.height - Constant.SUGAR_WIDTH*Constant.MAP_SIZE)/2;
        clippingPanel.addChild(this.mapPanel, 1);

        this.effectPanel = new cc.Sprite();
        clippingPanel.addChild(this.effectPanel, 2);

        var stencil = new cc.DrawNode();
        stencil.drawRect(cc.p(this.mapPanel.x,this.mapPanel.y), cc.p(this.mapPanel.x+Constant.SUGAR_WIDTH*Constant.MAP_SIZE,this.mapPanel.y+Constant.SUGAR_WIDTH*Constant.MAP_SIZE),
            cc.color(0,0,0), 1, cc.color(0,0,0));
        clippingPanel.stencil = stencil;

        if("touches" in cc.sys.capabilities)
            cc.eventManager.addListener({event: cc.EventListener.TOUCH_ONE_BY_ONE, onTouchBegan: this._onTouchBegan.bind(this)}, this.mapPanel);
        else
            cc.eventManager.addListener({event: cc.EventListener.MOUSE, onMouseDown: this._onMouseDown.bind(this)}, this.mapPanel);

        this._init(level);

        this.ui = new GameUI(this);
        this.addChild(this.ui, 3);

            cc.eventManager.addListener({
                event: cc.EventListener.KEYBOARD,
                onKeyReleased: function(keyCode, event) {
                    if (keyCode == cc.KEY.back) {
                        cc.director.end();
                    }
                }}, this);

        return true;
    },

    _init: function (level) {
        this.score = 0;
        this.steps = 0;
        this.sugarPopCount = [];
        for (var i = 0; i < Constant.SUGAR_TYPE_COUNT; i++) {
            this.sugarPopCount[i] = 0;
        }
        this.timeElapsed = 0;
        this.level = level;

        this.limitStep = Config.levels[this.level].limit.step;
        this.limitTime = Config.levels[this.level].limit.time;
        if(!this.limitStep){
            this.schedule((function(){
                this.timeElapsed++;
                this._checkLevelSucceedOrFail();
            }).bind(this), 1);
        }

        this.map = [];
        for (var i = 0; i < Constant.MAP_SIZE; i++) {
            var column = [];
            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                var objectConfig = Config.levels[this.level].map[i][j];
                var mapObject = this._generateMapObject(objectConfig, i, j);
                this.mapPanel.addChild(mapObject, mapObject.depth);
                mapObject.x = i * Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                mapObject.y = j * Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                if(!(mapObject instanceof BlankHole)){
                    var bg = new cc.Sprite("#sugar_bg.png");
                    this.mapPanel.addChild(bg, 1);
                    bg.x = mapObject.x;
                    bg.y = mapObject.y;
                }
                column.push(mapObject);
            }
            this.map.push(column);
        }

        this.map[6][2].setEffect(3);
    },

    /**
     * 生成地图元素
     * @param config Config文件中的数字串
     * @param column
     * @param row
     * @returns {*}
     * @private
     */
    _generateMapObject: function (config, column, row) {
        var mapObject = null;
        var objectCode = parseInt(config.toString()[0]);            //第一位是类型
        var objectParam = config.toString().substring(1); //后续的数字是参数
        switch (objectCode){
            case Constant.MAP_SUGAR:
                mapObject = Sugar.create(column, row, this._randomSugarType());
                break;

            case Constant.MAP_FROSTING:
                var level = parseInt(objectParam[0]);
                mapObject = new Frosting(column, row, level, objectParam[1]);
                break;

            case Constant.MAP_SUGAR_BOMB:
                var steps = parseInt(objectParam[0]);
                mapObject = new SugarBomb(column, row, steps, this._randomSugarType());
                break;

            case Constant.MAP_WHIRLPOOL:
                mapObject = new Whirlpool(column, row);
                break;

            case Constant.MAP_SUGAR_LOCK:
                mapObject = new SugarLock(column, row, this._randomSugarType());
                break;

            case Constant.MAP_CHOCOLATE:
                mapObject = new Chocolate(column, row);
                break;

            case Constant.MAP_CHOCOLATE_MACHINE:
                mapObject = new ChocolateMachine(column, row);
                this.chocolateMachine = mapObject;
                break;

            default:
                mapObject = new BlankHole(column, row);
                break;
        }
        mapObject.objectCode = objectCode;
        return mapObject;
    },

    _randomSugarType: function () {
        var config = Config.levels[this.level].rates;
        var total = 0;
        for (var i = 0; i < config.length; i++) {
            total += config[i];
        }
        var rate = Math.random();
        var temp = 0;
        for (var i = 0; i < config.length; i++) {
            temp += config[i];
            if(rate <= temp/total){
                return i + 1;
            }
        }
        return Constant.SUGAR_TYPE_COUNT;
    },

    _onTouchBegan: function (touch, event) {
        var column = Math.floor((touch.getLocation().x - this.mapPanel.x)/Constant.SUGAR_WIDTH);
        var row = Math.floor((touch.getLocation().y - this.mapPanel.y)/Constant.SUGAR_WIDTH);
        this._handleClickOrTouch(column, row);
		return true;
    },

    _onMouseDown: function (event) {
        var column = Math.floor((event.getLocationX() - this.mapPanel.x)/Constant.SUGAR_WIDTH);
        var row = Math.floor((event.getLocationY() - this.mapPanel.y)/Constant.SUGAR_WIDTH);
        this._handleClickOrTouch(column, row);
    },

    _handleClickOrTouch: function (column, row) {
        if(column < 0 || column >= Constant.MAP_SIZE || row < 0 || row >= Constant.MAP_SIZE){
            if(this.chosenSugars){
                for (var i = 0; i < this.chosenSugars.length; i++) {
                    this.chosenSugars[i].markChosen(false);
                }
            }
            return;
        }
        if(this.usingPropId){
            this._useProp(column, row);
        }else{
            this._popSugars(column, row);
        }
    },

    _checkSugarExist: function(i, j){
        if(i >= 0 && i < Constant.MAP_SIZE && j >= 0 && j < Constant.MAP_SIZE){
            return ((this.map[i][j] instanceof Sugar) && !(this.map[i][j] instanceof SugarLock) && (this.map[i][j].status != Constant.STATUS_DELETE));
        }
        return false;
    },

    _popSugars: function (column, row) {
        if(this.moving || !(this.map[column][row] instanceof Sugar) || (this.map[column][row] instanceof SugarLock))
            return;
        this.popColumn = column;
        this.popRow = row;

        if(this.map[column][row].effect == Constant.EFFECT_COLORFUL){
            var random = [];
            if(this._checkSugarExist(column-1,row)){
                random.push(this.map[column-1][row]);
            }
            if(this._checkSugarExist(column+1,row)){
                random.push(this.map[column+1][row]);
            }
            if(this._checkSugarExist(column,row-1)){
                random.push(this.map[column][row-1]);
            }
            if(this._checkSugarExist(column,row+1)){
                random.push(this.map[column][row+1]);
            }
            var second = null;
            for (var i = 0; i < random.length; i++) {
                if(random[i].effect == Constant.EFFECT_COLORFUL){
                    second = random[i];
                    break;
                }
            }
            if(!second){
                second = random[Math.floor(Math.random()*random.length)];
            }
            this.steps++;
            this._onePopActionBegin();
            this._showColorfulEffects(this.map[column][row], second);
        }else{
            ///find join sugars
            var joinSugars = [this.map[column][row]];
            var index = 0;
            var pushIntoSugars = function(element){
                if(joinSugars.indexOf(element) < 0)
                    joinSugars.push(element);
            };
            while(index < joinSugars.length){
                var sugar = joinSugars[index];
                if(this._checkSugarExist(sugar.column-1, sugar.row) && this.map[sugar.column-1][sugar.row].type == sugar.type){
                    pushIntoSugars(this.map[sugar.column-1][sugar.row]);
                }
                if(this._checkSugarExist(sugar.column+1, sugar.row) && this.map[sugar.column+1][sugar.row].type == sugar.type){
                    pushIntoSugars(this.map[sugar.column+1][sugar.row]);
                }
                if(this._checkSugarExist(sugar.column, sugar.row-1) && this.map[sugar.column][sugar.row-1].type == sugar.type){
                    pushIntoSugars(this.map[sugar.column][sugar.row-1]);
                }
                if(this._checkSugarExist(sugar.column, sugar.row+1) && this.map[sugar.column][sugar.row+1].type == sugar.type){
                    pushIntoSugars(this.map[sugar.column][sugar.row+1]);
                }

                index++;
            }

            if(joinSugars.length <= 1)
                return;

            if(joinSugars[0].status == Constant.STATUS_NORMAL && joinSugars[0].effect != Constant.EFFECT_COLORFUL){
                if(this.chosenSugars && this.chosenSugars.indexOf(joinSugars[0]) < 0){
                    for (var i = 0; i < this.chosenSugars.length; i++) {
                        this.chosenSugars[i].markChosen(false);
                    }
                }
                for (var i = 0; i < joinSugars.length; i++) {
                    joinSugars[i].markChosen(true);
                }
                this.chosenSugars = joinSugars;
            } else {
                this.steps++;
                this._onePopActionBegin();

                var existEffectSugars = [];
                for (var i = 0; i < joinSugars.length; i++) {
                    if(joinSugars[i].effect != Constant.EFFECT_NONE)
                        existEffectSugars.push(joinSugars[i]);
                }

                var effectSugars = this._checkEffectSugars(joinSugars);
                for (var i = 0; i < joinSugars.length; i++) {
                    this._removeMapObject(joinSugars[i]);
                }
                //生成特殊糖果
                for (var i = 0; i < effectSugars.length; i++) {
                    var sugar = Sugar.create(effectSugars[i].column, effectSugars[i].row, effectSugars[i].type);
                    this._addMapObject(sugar);
                    sugar.setEffect(effectSugars[i].effect);
                }

                //TODO 播放糖果抖动被消除的效果，特殊糖果有停留原地发光的效果
                this._showSugarEffects(existEffectSugars);
            }
        }
    },

    /**
     * 用于初始化一些统计字段
     * @private
     */
    _onePopActionBegin: function () {
        this.moving = true;
        this.popBombSugarsCount = 0;
        this.popLineSugarsCount = 0;
        this.explodeRound = 0;
        this.frostingDecreaseRecord = [];
        this.hitWhirlpool = false;
        this.popSugarCount = [];
        this.popSpecialSugarCount = {};
        this.popBlockCount = {};
        this.chocolateDeleted = false;
    },

    /**
     * 展示特殊糖果作用（连环爆炸）
     * @param existEffectSugars
     * @private
     */
    _showSugarEffects: function (existEffectSugars) {
        this.explodeRound++;
        this.score += calculateScore(this.popSugarCount, this.popSpecialSugarCount, this.popBlockCount);
        this.popBombSugarsCount = [];
        this.popBlockCount = {};
        this.popSpecialSugarCount = {};

        //先展示效果
        if(existEffectSugars.length && !this.hitWhirlpool){
            var randomType = 0; //用于彩糖效果
            for (var i = 0; i < existEffectSugars.length; i++) {
                var sugar = existEffectSugars[i];
                switch (sugar.effect){
                    case Constant.EFFECT_HORIZONTAL:
                    case Constant.EFFECT_VERTICAL:
                        this.popLineSugarsCount++;
                        var effect = new cc.Sprite("#line_effect.png");
                        this.effectPanel.addChild(effect);
                        var width = effect.width;
                        effect.scaleX = Constant.SUGAR_WIDTH / width;
                        effect.x = this.mapPanel.x + sugar.column*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        effect.y = this.mapPanel.y + sugar.row*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        effect.runAction(cc.scaleTo(0.2, Constant.SUGAR_WIDTH*3*Constant.MAP_SIZE/width, 1));
                        if(sugar.effect == Constant.EFFECT_VERTICAL){
                            effect.rotation = 90;
                        }
                        break;

                    case Constant.EFFECT_BOMB:
                        this.popBombSugarsCount++;
                        var effect = new cc.Sprite("#bomb/1.png");
                        this.effectPanel.addChild(effect);
                        effect.x = this.mapPanel.x + sugar.column*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        effect.y = this.mapPanel.y + sugar.row*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        var animationFrames = [];
                        for (var i = 1; i <= 12; i++) {
                            animationFrames.push(cc.spriteFrameCache.getSpriteFrame("bomb/" + i + ".png"));
                        }
                        var animation = new cc.Animation(animationFrames, 0.1);
                        effect.runAction(cc.animate(animation));
                        break;

                    case Constant.EFFECT_COLORFUL:
                        //TODO 全部晃动
                        trace("遇到彩糖");
                        randomType = this._findExistSugarRandomType();
                        break;

                    case Constant.EFFECT_BIG_BOMB:
                        var effect = new cc.DrawNode();
                        this.effectPanel.addChild(effect);
                        effect.x = this.mapPanel.x;
                        effect.y = this.mapPanel.y;
                        effect.drawRect(cc.p((sugar.column-2)*Constant.SUGAR_WIDTH,(sugar.row-2)*Constant.SUGAR_WIDTH),
                            cc.p((sugar.column+3)*Constant.SUGAR_WIDTH,(sugar.row+3)*Constant.SUGAR_WIDTH), cc.color(255,255,255,180));
                        break;

                    case Constant.EFFECT_CROSS:
                        var effect1 = new cc.Sprite("#line_effect.png");
                        this.effectPanel.addChild(effect1, 1);
                        var effect2 = new cc.Sprite("#line_effect.png");
                        this.effectPanel.addChild(effect2, 2);
                        var width = effect1.width;
                        effect1.scaleX = effect2.scaleX = Constant.SUGAR_WIDTH / width;
                        effect1.x = effect2.x = this.mapPanel.x + sugar.column*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        effect1.y = effect2.y = this.mapPanel.y + sugar.row*Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
                        effect1.runAction(cc.scaleTo(0.3, Constant.SUGAR_WIDTH*3*Constant.MAP_SIZE/width, 1));
                        effect2.runAction(cc.scaleTo(0.3, Constant.SUGAR_WIDTH*3*Constant.MAP_SIZE/width, 1));
                        effect2.rotation = 90;
                        break;

                    case Constant.EFFECT_HORIZONTAL_BOMB:
                        var effect = new cc.DrawNode();
                        this.effectPanel.addChild(effect);
                        effect.x = this.mapPanel.x;
                        effect.y = this.mapPanel.y;
                        effect.drawRect(cc.p(0, (sugar.row-1)*Constant.SUGAR_WIDTH),
                            cc.p(Constant.MAP_SIZE*Constant.SUGAR_WIDTH, (sugar.row+2)*Constant.SUGAR_WIDTH), cc.color(255,255,255,180));
                        break;

                    case Constant.EFFECT_VERTICAL_BOMB:
                        var effect = new cc.DrawNode();
                        this.effectPanel.addChild(effect);
                        effect.x = this.mapPanel.x;
                        effect.y = this.mapPanel.y;
                        effect.drawRect(cc.p((sugar.column-1)*Constant.SUGAR_WIDTH, 0),
                            cc.p((sugar.column+2)*Constant.SUGAR_WIDTH, Constant.MAP_SIZE*Constant.SUGAR_WIDTH), cc.color(255,255,255,180));
                        break;
                }
            }

            function schedule() {
                var newEffectSugars = [];
                var checkAndRemoveObject = (function(o){
                    if(o && (o instanceof Sugar) && o.status != Constant.STATUS_DELETE){
                        if(o.effect != Constant.EFFECT_NONE && existEffectSugars.indexOf(o) < 0)
                            newEffectSugars.push(o);
                    }
                    this._removeMapObject(o);
                }).bind(this);

                this.effectPanel.removeAllChildren();
                for (var i = 0; i < existEffectSugars.length; i++) {
                    var sugar = existEffectSugars[i];
                    switch (sugar.effect){
                        case Constant.EFFECT_HORIZONTAL:
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                checkAndRemoveObject(this.map[j][sugar.row]);
                            }
                            break;

                        case Constant.EFFECT_VERTICAL:
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                checkAndRemoveObject(this.map[sugar.column][j]);
                            }
                            break;

                        case Constant.EFFECT_BOMB:
                            for (var j = -1; j <= 1; j++) {
                                for (var k = -1; k <= 1; k++) {
                                    if(j == 0 && k == 0)
                                        continue;
                                    if(sugar.column+j >= 0 && sugar.column+j < Constant.MAP_SIZE && sugar.row+k >= 0 && sugar.row+k < Constant.MAP_SIZE){
                                        checkAndRemoveObject(this.map[sugar.column+j][sugar.row+k]);
                                    }
                                }
                            }
                            break;

                        //这里只会是爆炸过程中遇到的彩糖，消除场上随机一个颜色
                        case Constant.EFFECT_COLORFUL:
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                for (var k = 0; k < Constant.MAP_SIZE; k++) {
                                    if(this._checkSugarExist(j,k) && this.map[j][k].type == randomType){
                                        checkAndRemoveObject(this.map[j][k]);
                                    }
                                }
                            }
                            break;

                        case Constant.EFFECT_BIG_BOMB:
                            var range = 2;
                            for (var j = -range; j <= range; j++) {
                                for (var k = -range; k <= range; k++) {
                                    if(j == 0 && k == 0)
                                        continue;
                                    if(sugar.column+j >= 0 && sugar.column+j < Constant.MAP_SIZE && sugar.row+k >= 0 && sugar.row+k < Constant.MAP_SIZE){
                                        checkAndRemoveObject(this.map[sugar.column+j][sugar.row+k]);
                                    }
                                }
                            }
                            break;

                        case Constant.EFFECT_CROSS:
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                checkAndRemoveObject(this.map[j][sugar.row]);
                            }
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                checkAndRemoveObject(this.map[sugar.column][j]);
                            }
                            break;

                        case Constant.EFFECT_HORIZONTAL_BOMB:
                            for (var k = Math.max(0,sugar.row-1); k < Constant.MAP_SIZE && k <= sugar.row + 1; k++) {
                                for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                    checkAndRemoveObject(this.map[j][k]);
                                }
                            }
                            break;

                        case Constant.EFFECT_VERTICAL_BOMB:
                            for (var k = Math.max(0,sugar.column-1); k < Constant.MAP_SIZE && k <= sugar.column + 1; k++) {
                                for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                    checkAndRemoveObject(this.map[k][j]);
                                }
                            }
                            break;
                    }
                }
                this._showSugarEffects(newEffectSugars);
            }
            this.scheduleOnce(schedule.bind(this), 0.3);

        }else{
            //特效糖为空就表示已经完成所有爆炸，开始掉落糖果，补充空位
            this._generateNewSugars();
        }
    },

    /**
     * 点彩糖时，专门的效果
     * @param colorfulSugar
     * @param secondSugar
     * @private
     */
    _showColorfulEffects: function (colorfulSugar, secondSugar){
        this.scheduleOnce((function(){
            secondSugar.markChosen(true);
            this.scheduleOnce((function(){
                this._removeMapObject(colorfulSugar);
                if(secondSugar.effect == Constant.EFFECT_NONE){
                    //TODO 播放糖果抖动被消除的效果，特殊糖果有停留原地发光的效果
                    var existEffectSugars = [];
                    for (var i = 0; i < Constant.MAP_SIZE; i++) {
                        for (var j = 0; j < Constant.MAP_SIZE; j++) {
                            if(this.map[i][j] && this.map[i][j].type == secondSugar.type){
                                if(this.map[i][j].effect != Constant.EFFECT_NONE){
                                    existEffectSugars.push(this.map[i][j]);
                                }
                                this._removeMapObject(this.map[i][j]);
                            }
                        }
                    }
                    this._showSugarEffects(existEffectSugars);

                } else {
                    if(secondSugar.effect == Constant.EFFECT_COLORFUL){
                        //TODO 播放糖果抖动被消除的效果
                        for (var i = 0; i < Constant.MAP_SIZE; i++) {
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                this._removeMapObject(this.map[i][j]);
                            }
                        }
                        this._showSugarEffects([]);
                    }else{
                        //TODO 播放特效扩散到每个同色糖果的动画
                        for (var i = 0; i < Constant.MAP_SIZE; i++) {
                            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                if(this.map[i][j] && this.map[i][j].type == secondSugar.type
                                    && this.map[i][j] != secondSugar && this.map[i][j].effect == Constant.EFFECT_NONE){
                                    if(this.map[i][j] instanceof SugarLock){
                                        this._removeMapObject(this.map[i][j]);
                                    }else{
                                        this.map[i][j].setEffect(secondSugar.effect);
                                    }
                                }
                            }
                        }
                        this.scheduleOnce((function(){
                            var existEffectSugars = [];
                            for (var i = 0; i < Constant.MAP_SIZE; i++) {
                                for (var j = 0; j < Constant.MAP_SIZE; j++) {
                                    if(this.map[i][j] && this.map[i][j].type == secondSugar.type && this.map[i][j] != secondSugar){
                                        existEffectSugars.push(this.map[i][j]);
                                        this._removeMapObject(this.map[i][j]);
                                    }
                                }
                            }
                            this._showSugarEffects(existEffectSugars);
                        }).bind(this), 1.0);
                    }
                }
                this._removeMapObject(secondSugar);
                this.explodeRound++;

            }).bind(this), 0.5);
        }).bind(this), 0.5);
    },

    /**
     *
     * @param object
     * @param removeAll {boolean} 用于道具的情况，一次把整个格子删除，不管是糖霜还是甘草锁
     * @private
     */
    _removeMapObject: function (object, removeAll) {
        //防止重复删除
        if(object && (!(object instanceof BlankHole)) && (!(object instanceof ChocolateMachine)) && this.map[object.column][object.row]){
            if(removeAll){
                //锤子的情况
                if(object.objectCode == Constant.MAP_SUGAR){
                    this._showSugarDeletedEffect(object);
                    cc.pool.putInPool(object);
                }
                this.mapPanel.removeChild(object);
                this.map[object.column][object.row] = null;
                this._countUpAllMapObjectCount(object);
            }else{
                this._decreaseFrosting(object.column, object.row);
                this._decreaseChocolate(object.column, object.row);
                if(!(object instanceof Frosting) && !(object instanceof Chocolate)){
                    if(object.objectCode == Constant.MAP_SUGAR){
                        this._showSugarDeletedEffect(object);
                        cc.pool.putInPool(object);
                    }
                    this.mapPanel.removeChild(object);
                    this.map[object.column][object.row] = null;
                    //只有特殊爆炸才能炸掉甘草锁糖果，然后换成普通糖果
                    if(object instanceof SugarLock){
                        var sugar = Sugar.create(object.column, object.row, object.type);
                        this._addMapObject(sugar);
                        //TODO 加入甘草锁去除的动画
                    }
                    this._countUpAllMapObjectCount(object);
                }
            }
        }
    },

    _countUpAllMapObjectCount: function (object) {
        if(object.block){
            this.popBlockCount[object.objectCode] = (0|this.popBlockCount[object.objectCode]) + 1;
        }else if(object instanceof Sugar){
            this.sugarPopCount[object.type]++;
            this.popSugarCount[object.type] = (0|this.popSugarCount[object.type]) + 1;
            if(object.effect != Constant.EFFECT_NONE){
                this.popSpecialSugarCount[object.effect] = (0|this.popSpecialSugarCount[object.effect]) + 1;
            }
        }
    },

    _addMapObject: function (object) {
        object.x = object.column * Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
        object.y = object.row * Constant.SUGAR_WIDTH + Constant.SUGAR_WIDTH/2;
        this.mapPanel.addChild(object, object.depth);
        this.map[object.column][object.row] = object;
    },

    /**
     * 检查出全部特效糖果
     * @param joinSugars
     * @returns {Array}
     * @private
     */
    _checkEffectSugars: function (joinSugars) {
        var beginColumn = Constant.MAP_SIZE;
        var beginRow = Constant.MAP_SIZE;
        var endColumn = 0;
        var endRow = 0;
        for (var i = 0; i < joinSugars.length; i++) {
            beginColumn = Math.min(joinSugars[i].column, beginColumn);
            beginRow = Math.min(joinSugars[i].row, beginRow);
            endColumn = Math.max(joinSugars[i].column, endColumn);
            endRow = Math.max(joinSugars[i].row, endRow);
        }

        var checkExist = (function(i, j){
            if(i >= beginColumn && i <= endColumn && j >= beginRow && j <= endRow){
                return ((this.map[i][j] instanceof Sugar) && this.map[i][j].status != Constant.STATUS_DELETE
                    && this.map[i][j].effect != Constant.EFFECT_COLORFUL && joinSugars.indexOf(this.map[i][j]) >= 0);
            }
            return false;
        }).bind(this);

        //check colorful sugars and line sugars
        var colorfulSugars = [];
        if(endColumn - beginColumn >= 4){
            for (var j = beginRow; j <= endRow; j++) {
                var sequenceCount = 0;
                for (var i = beginColumn; i <= endColumn; i++) {
                    if(checkExist(i, j)) {
                        sequenceCount++;
                        if(sequenceCount == 5) {
                            //标记这些糖已经被用了转为彩糖
                            for (var k = 0; k < 5; k++) {
                                this.map[i-k][j].status = Constant.STATUS_DELETE;
                            }
                            colorfulSugars.push(this.map[i-2][j]);
                            sequenceCount = 0;
                        }
                    } else {
                        sequenceCount = 0;
                    }
                }
            }
        }
        if(endRow - beginRow >= 4){
            for (var i = beginColumn; i <= endColumn; i++) {
                var sequenceCount = 0;
                for (var j = beginRow; j <= endRow; j++) {
                    if(checkExist(i, j)) {
                        sequenceCount++;
                        if(sequenceCount == 5) {
                            for (var k = 0; k < 5; k++) {
                                this.map[i][j-k].status = Constant.STATUS_DELETE;
                            }
                            colorfulSugars.push(this.map[i][j-2]);
                            sequenceCount = 0;
                        }
                    } else {
                        sequenceCount = 0;
                    }
                }
            }
        }

        //check line sugars
        var lineSugars = [];
        if(endColumn - beginColumn >= 3){
            for (var j = beginRow; j <= endRow; j++) {
                var sequenceCount = 0;
                for (var i = beginColumn; i <= endColumn; i++) {
                    if(checkExist(i, j)) {
                        sequenceCount++;
                        if(sequenceCount == 4) {
                            //标记这些糖已经被用了转为彩糖
                            for (var k = 0; k < 4; k++) {
                                this.map[i-k][j].status = Constant.STATUS_DELETE;
                            }
                            lineSugars.push(this.map[i-1][j]);
                            sequenceCount = 0;
                        }
                    } else {
                        sequenceCount = 0;
                    }
                }
            }
        }
        if(endRow - beginRow >= 3){
            for (var i = beginColumn; i <= endColumn; i++) {
                var sequenceCount = 0;
                for (var j = beginRow; j <= endRow; j++) {
                    if(checkExist(i, j)) {
                        sequenceCount++;
                        if(sequenceCount == 4) {
                            for (var k = 0; k < 4; k++) {
                                this.map[i][j-k].status = Constant.STATUS_DELETE;
                            }
                            lineSugars.push(this.map[i][j-1]);
                            sequenceCount = 0;
                        }
                    } else {
                        sequenceCount = 0;
                    }
                }
            }
        }

        //check bomb sugars
        var bombSugars = [];
        if((endColumn - beginColumn >= 2) && (endRow - beginRow >= 2)){
            for (var i = beginColumn; i <= endColumn; i++) {
                for (var j = beginRow; j <= endRow; j++) {
                    if(!checkExist(i,j)) {
                        continue;
                    }
                    var horizontal = 0;
                    var vertical = 0;
                    if(checkExist(i-1,j) && checkExist(i+1,j)){
                        horizontal = 2;
                    }else if(checkExist(i-2,j) && checkExist(i-1,j)){
                        horizontal = 1;
                    }else if(checkExist(i+1,j) && checkExist(i+2,j)){
                        horizontal = 3;
                    }
                    if(checkExist(i,j-1) && checkExist(i,j+1)){
                        vertical = 2;
                    }else if(checkExist(i,j-2) && checkExist(i,j-1)){
                        vertical = 1;
                    }else if(checkExist(i,j+1) && checkExist(i,j+2)){
                        vertical = 3;
                    }

                    //排除十字形
                    if(horizontal == 2 && vertical == 2)
                        continue;

                    if(horizontal && vertical){
                        bombSugars.push(this.map[i][j]);

                        if(horizontal == 1){
                            this.map[i-2][j].status = Constant.STATUS_DELETE;
                            this.map[i-1][j].status = Constant.STATUS_DELETE;
                        }else if(horizontal == 2){
                            this.map[i-1][j].status = Constant.STATUS_DELETE;
                            this.map[i+1][j].status = Constant.STATUS_DELETE;
                        }else if(horizontal == 3){
                            this.map[i+2][j].status = Constant.STATUS_DELETE;
                            this.map[i+1][j].status = Constant.STATUS_DELETE;
                        }

                        if(vertical == 1){
                            this.map[i][j-2].status = Constant.STATUS_DELETE;
                            this.map[i][j-1].status = Constant.STATUS_DELETE;
                        }else if(vertical == 2){
                            this.map[i][j-1].status = Constant.STATUS_DELETE;
                            this.map[i][j+1].status = Constant.STATUS_DELETE;
                        }else if(vertical == 3){
                            this.map[i][j+2].status = Constant.STATUS_DELETE;
                            this.map[i][j+1].status = Constant.STATUS_DELETE;
                        }
                    }
                }
            }
        }

        for (var i = 0; i < colorfulSugars.length; i++) {
            colorfulSugars[i].effect = Constant.EFFECT_COLORFUL;
            colorfulSugars[i].status = Constant.STATUS_NORMAL;
        }
        for (var i = 0; i < lineSugars.length; i++) {
            lineSugars[i].effect = Math.random() < 0.5 ? Constant.EFFECT_HORIZONTAL:Constant.EFFECT_VERTICAL;
            lineSugars[i].status = Constant.STATUS_NORMAL;
        }
        for (var i = 0; i < bombSugars.length; i++) {
            bombSugars[i].effect = Constant.EFFECT_BOMB;
            bombSugars[i].status = Constant.STATUS_NORMAL;
        }
        return [].concat(colorfulSugars, lineSugars, bombSugars);
    },

    _generateNewSugars: function () {
        var maxTime = 0;
        this.moving = true;
        if(this.popBombSugarsCount >= 2 || this.popLineSugarsCount >= 2 || (this.popLineSugarsCount >= 1 && this.popBombSugarsCount >= 1)){

            var sugar = this.map[this.popColumn][this.popRow];
            //如果在点击的位置已经生成了新的特殊糖
            if(!sugar){
                sugar = Sugar.create(this.popColumn, this.popRow, this._randomSugarType());
                this._addMapObject(sugar);
            }

            if(this.popBombSugarsCount >= 2){
                sugar.setEffect(Constant.EFFECT_BIG_BOMB);
            } else if(this.popLineSugarsCount >= 1 && this.popBombSugarsCount >= 1){
                sugar.setEffect(Constant.EFFECT_HORIZONTAL_BOMB);
            } else if(this.popLineSugarsCount >= 2){
                sugar.setEffect(Constant.EFFECT_CROSS);
            }
        }
        for (var i = 0; i < Constant.MAP_SIZE; i++) {        //deal each column
            var missCount = 0;
            for (var j = 0; j < this.map[i].length; j++) {
                if(this.map[i][j]){
                    if(!(this.map[i][j] instanceof Sugar) || this.map[i][j].block){
                        continue;
                    }
                }

                var blocksCountAbove = 0;
                for (var k = j; k < Constant.MAP_SIZE; k++) {
                    if(this.map[i][k] && this.map[i][k].block){
                        blocksCountAbove++;
                    }
                }

                var sugar = this.map[i][j];
                if(!sugar){
                    if(blocksCountAbove == 0){
                        sugar = Sugar.create(i, Constant.MAP_SIZE+missCount, this._randomSugarType());
                        this._addMapObject(sugar);
                        missCount++;
                    }
                }else{
                    var fallLength = 0;
                    var blankHoleCount = 0;
                    for (var k = j - 1; k >= 0; k--) {       //find out how long will each sugar falls
                        if(this.map[i][k]){
                            if(this.map[i][k].block){
                                break;
                            }else if(this.map[i][k] instanceof BlankHole){
                                blankHoleCount++;
                            }
                        }else{
                            fallLength += blankHoleCount + 1;   //先累计途中有多少个blankhole，如果真遇到空位，就把blankhole个数累计到falllength中。
                            blankHoleCount = 0;
                        }
                    }

                    if(fallLength > 0){
                        var duration = Math.sqrt(2*fallLength/Constant.FALL_ACCELERATION);
                        if(duration > maxTime)
                            maxTime = duration;
                        var move = cc.moveTo(duration, cc.p(sugar.x, sugar.y-Constant.SUGAR_WIDTH*fallLength)).easing(cc.easeIn(2));    //easeIn参数是幂，以几次幂加速
                        sugar.runAction(move);
                        sugar.row -= fallLength;        //adjust all sugars' row
                        this.map[i][j] = null;
                        this.map[i][sugar.row] = sugar;
                    }
                }
            }

            //移除超出地图的临时元素位置
            for (var j = this.map[i].length; j >= Constant.MAP_SIZE; j--) {
                this.map[i].splice(j, 1);
            }
        }
        this.scheduleOnce(this._finishSugarFalls.bind(this), maxTime);
        this._decreaseSugarBombsSteps();
        this._checkLevelSucceedOrFail();
        this.chosenSugars = null;
    },

    _finishSugarFalls: function () {
        this._chocolateGrow();
        this.scheduleOnce((function(){
            this.moving = false;
        }).bind(this), 1);      //预留1秒给巧克力生长
    },

    /**
     * 每一步后巧克力生长，随机选一个空位
     * @private
     */
    _chocolateGrow: function () {
        if(!this.chocolateDeleted){
            var chocolateList = [];
            if(this.chocolateMachine)
                chocolateList.push(this.chocolateMachine);
            for (var i = 0; i < Constant.MAP_SIZE; i++) {
                for (var j = 0; j < Constant.MAP_SIZE; j++) {
                    if(this.map[i][j] && this.map[i][j] instanceof Chocolate){
                        chocolateList.push(this.map[i][j]);
                    }
                }
            }
            if(chocolateList.length > 0){
                var target = null;
                var source = null;
                for (var i = 0; i < chocolateList.length; i++) {
                    var aroundSugarList = [];
                    var column = chocolateList[i].column;
                    var row = chocolateList[i].row;
                    if(this._checkSugarExist(column-1,row)){
                        aroundSugarList.push(this.map[column-1][row]);
                    }
                    if(this._checkSugarExist(column,row-1)){
                        aroundSugarList.push(this.map[column][row-1]);
                    }
                    if(this._checkSugarExist(column+1,row)){
                        aroundSugarList.push(this.map[column+1][row]);
                    }
                    if(this._checkSugarExist(column,row+1)){
                        aroundSugarList.push(this.map[column][row+1]);
                    }
                    if(aroundSugarList.length > 0){
                        target = aroundSugarList[parseInt(Math.random()*aroundSugarList.length)];
                        source = chocolateList[i];
                        break;
                    }
                }
                if(target){
                    source.grow(target.column, target.row);
                    this.mapPanel.removeChild(target);
                    this._addMapObject(new Chocolate(target.column, target.row));
                }
            }
        }
    },

    _decreaseSugarBombsSteps: function () {
        for (var i = 0; i < Constant.MAP_SIZE; i++) {
            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                if(this.map[i][j] && this.map[i][j] instanceof SugarBomb){
                    this.map[i][j].decreaseSteps();
                }
            }
        }
    },

    /**
     * 消除糖霜一层
     * @param column 糖果消除的位置
     * @param row
     * @private
     */
    _decreaseFrosting: function (column, row) {
        var isFrosting = (function(column, row){
            return (column >= 0 && row >= 0 && column < Constant.MAP_SIZE && row < Constant.MAP_SIZE
                && this.map[column][row] && this.map[column][row] instanceof Frosting);
        }).bind(this);
        var frostingList = [];
        if(isFrosting(column,row)){
            frostingList.push(this.map[column][row]);
        }
        //如果当前点是糖
        if(this._checkSugarExist(column, row)){
            if(isFrosting(column-1,row)){
                frostingList.push(this.map[column-1][row]);
            }
            if(isFrosting(column,row-1)){
                frostingList.push(this.map[column][row-1]);
            }
            if(isFrosting(column+1,row)){
                frostingList.push(this.map[column+1][row]);
            }
            if(isFrosting(column,row+1)){
                frostingList.push(this.map[column][row+1]);
            }
        }

        for (var i = 0; i < frostingList.length; i++) {
            var frosting = frostingList[i];
            //本轮已经消除过这个糖霜
            this.frostingDecreaseRecord[this.explodeRound] = this.frostingDecreaseRecord[this.explodeRound] || [];
            if(this.frostingDecreaseRecord[this.explodeRound].indexOf(frosting) >= 0){
                continue;
            }
            frosting.decreaseLevel();
            this.popBlockCount[Constant.MAP_FROSTING] = (0|this.popBlockCount[Constant.MAP_FROSTING]) + 1;
            if(frosting.level == 0){
                var sugar = this._generateMapObject(frosting.content, frosting.column, frosting.row);
                this.mapPanel.removeChild(frosting);
                this.map[frosting.column][frosting.row] = null;
                //TODO 糖霜移除的效果
                this._addMapObject(sugar);
            }else{
                this.frostingDecreaseRecord[this.explodeRound].push(frosting);
            }
        }
    },

    /**
     * 消除巧克力
     * @param column 糖果消除的位置
     * @param row
     * @private
     */
    _decreaseChocolate: function (column, row) {
        var isChocolate = (function(column, row){
            return (column >= 0 && row >= 0 && column < Constant.MAP_SIZE && row < Constant.MAP_SIZE
                && this.map[column][row] && this.map[column][row] instanceof Chocolate);
        }).bind(this);
        var chocolateList = [];
        if(isChocolate(column,row)){
            chocolateList.push(this.map[column][row]);
        }
        //如果当前点是糖
        if(this._checkSugarExist(column, row)){
            if(isChocolate(column-1,row)){
                chocolateList.push(this.map[column-1][row]);
            }
            if(isChocolate(column,row-1)){
                chocolateList.push(this.map[column][row-1]);
            }
            if(isChocolate(column+1,row)){
                chocolateList.push(this.map[column+1][row]);
            }
            if(isChocolate(column,row+1)){
                chocolateList.push(this.map[column][row+1]);
            }
        }
        for (var i = 0; i < chocolateList.length; i++) {
            this.mapPanel.removeChild(chocolateList[i]);
            this.map[chocolateList[i].column][chocolateList[i].row] = null;
            this.popBlockCount[Constant.MAP_CHOCOLATE] = (0|this.popBlockCount[Constant.MAP_CHOCOLATE]) + 1;
            //TODO 巧克力移除的效果
        }
        this.chocolateDeleted = this.chocolateDeleted || chocolateList.length > 0;
    },

    _checkLevelSucceedOrFail: function () {
        var task = Config.levels[this.level].task;
        var finish = false;
        if(task.score){
            if(this.score >= task.score){
                finish = true;
            }
        }else if(task.count){
            finish = true;
            for (var i = 0; i < task.count.length; i++) {
                if(this.sugarPopCount[i] < task.count[i]){
                    finish = false;
                    break;
                }
            }
        }
        if(finish){
            this.ui.showSuccess();
            this.scheduleOnce(function(){
                this.level++;
                cc.director.runScene(new LevelListScene());
            }, 3);
        }else{
            var sugarBombExploded = false;
            for (var i = 0; i < Constant.MAP_SIZE; i++) {
                for (var j = 0; j < Constant.MAP_SIZE; j++) {
                    if(this.map[i][j] && this.map[i][j] instanceof SugarBomb && this.map[i][j].isOver()){
                        sugarBombExploded = true;
                        break;
                    }
                }
            }
            if(sugarBombExploded || (this.limitStep && this.steps > this.limitStep) || (!this.limitStep && this.limitTime && this.timeElapsed > this.limitTime)){
                this.ui.showFail();
                this.scheduleOnce(function(){
                    cc.director.runScene(new LevelListScene());
                }, 3);
            }
        }
    },

    /**
     * 找到当前画面，随机一个颜色
     * @private
     */
    _findExistSugarRandomType: function () {
        var colorExist = [];
        for (var i = 0; i < Constant.MAP_SIZE; i++) {
            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                var o = this.map[i][j];
                if(o && o instanceof Sugar && !colorExist[o.type]){
                    colorExist.push(o.type);
                }
            }
        }
        return colorExist[parseInt(Math.random()*colorExist.length)];
    },

    _useProp: function (column, row) {
        if(this.map[column][row] instanceof BlankHole || this.map[column][row] instanceof ChocolateMachine || this.moving){
            return;
        }
        this._onePopActionBegin();
        switch (this.usingPropId){
            case Constant.PROP_HAMMER:
                this._onePopActionBegin();
                for (var j = column-Constant.PROP_HAMMER_RANGE; j <= column+Constant.PROP_HAMMER_RANGE; j++) {
                    for (var k = row-Constant.PROP_HAMMER_RANGE; k <= row+Constant.PROP_HAMMER_RANGE; k++) {
                        if(j >= 0 && j < Constant.MAP_SIZE && k >= 0 && k < Constant.MAP_SIZE){
                            this._removeMapObject(this.map[j][k], true);
                        }
                    }
                }
                break;

            case Constant.PROP_ROCKET:
                var object = this.map[column][row];
                var objectCode = object.objectCode;
                var sugarType = 0;
                if(object instanceof Sugar){
                    sugarType = object.type;
                }
                for (var i = 0; i < Constant.MAP_SIZE; i++) {
                    for (var j = 0; j < Constant.MAP_SIZE; j++) {
                        var o = this.map[i][j];
                        if(o){
                            //如果点的是甘草锁糖果，这里消除就复杂一些。要消除同色糖果和甘草锁糖果
                            if(sugarType){
                                if((o instanceof Sugar && o.type == sugarType) || (object instanceof SugarLock && o instanceof SugarLock)){
                                    this._removeMapObject(o, true);
                                }
                            }else if(o.objectCode == objectCode){
                                this._removeMapObject(o, true);
                            }
                        }
                    }
                }
                break;
        }
        this.score += calculateScore(this.popSugarCount, this.popSpecialSugarCount, this.popBlockCount);
        this._generateNewSugars();
        this.ui.finishUsingProp();
        this.usingPropId = 0;
    },

    _showSugarDeletedEffect: function (sugar) {
        var effect = new cc.Sprite();
        var animationFrames = [];
        for (var i = 1; i <= 5; i++) {
            animationFrames.push(cc.spriteFrameCache.getSpriteFrame("pop_" + sugar.type + "/" + i + ".png"));
        }
        var animation = new cc.Animation(animationFrames, 0.08, 1);
        effect.runAction(cc.sequence(cc.animate(animation), cc.callFunc(function(){
            this.effectPanel.removeChild(effect);
        }.bind(this))));
        this.effectPanel.addChild(effect, 0);
        effect.x = this.mapPanel.x + sugar.x;
        effect.y = this.mapPanel.y + sugar.y;
    },

    traceSugars: function () {
        trace("============================")
        for (var i = Constant.MAP_SIZE - 1; i >= 0; i--) {        //deal each row
            var row = [];
            for (var j = 0; j < Constant.MAP_SIZE; j++) {
                row.push(this.map[j][i]?this.map[j][i].type:0);
            }
            trace(row);
        }
    }
});

var GameScene = cc.Scene.extend({
    ctor: function (level) {
        this._super();
        var layer = new GameLayer(level);
        this.addChild(layer);
    }
});

