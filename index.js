/**
 * Created by fx on 17-4-29.
 */
const P = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const rp = require('request-promise');
const WorkerBase = require('yeedriver-base/WorkerBase');
const consts = require('yeedriver-base/consts');


const getPersonByName = "/api/person/getByName";
const visVisitor = "/api/visVisitor/list";
const device = "/api/device/accList";
const door = "/api/door/list";
const verifyPersInfo = "/api/accLevel/verifyPersInfo";
const editVisPCEntry = "/api/visVisitor/editVisPCEntry";
const editVisPCExit = "/api/visVisitor/editVisPCExit";

const uuid = require('uuid');
const ZH = class extends WorkerBase{

    getOption (url,body = {},method){

        return {
            method: method || (_.isEmpty(body)? "GET" : "POST"),
            uri:`${this.baseUrl}${url}`,
            body:body,
            qs: {
                access_token: this.token
            },
            headers: {
                'User-Agent': 'Request-Promise'
            },
            json:true
        }
    }

    initDriver(options,memories){

        this.pageNo = 1 || options.pageNo;
        this.pageSize = 9999 || options.pageSize;
        this.baseUrl = options.url;
        this.token = options.token;
        this.devices = this.devices || {};


        let url = `${door}?pageNo=${this.pageNo}&pageSize=${this.pageSize}`;

        rp(this.getOption(url)).then((result)=>{

            if(result.code){
                return P.reject("response error")
            }
            this.devices = {
                "0":"system"
            };

            options.ids = options.ids || {};

            let inIds = {};

            if(!options.ids[0]){
                inIds[0] = {
                    groupId:'.',
                    uniqueId:'system',
                    nameInGroup:'访客系统',
                }
            }

            _.each(result.data,(item) =>{
                this.devices[item.id] = "door";
                if(!options.ids[item.id]){
                    inIds[item.id] = {
                        groupId:'.',
                        uniqueId:'door',
                        nameInGroup:item.name
                    }
                }
            });

            if(!_.isEmpty(inIds)){
                this.inOrEx({type:"in",devices:inIds});
            }

            let outIds = {};

            _.each(options.ids,(item,key) =>{
                if(!this.devices[key]){
                    outIds[key] = ""
                }
            });

            if(!_.isEmpty(outIds)){
                this.inOrEx({type:"ex",devices:outIds});
            }

            if(!this.inited){
                this.setRunningState(this.RUNNING_STATE.CONNECTED);
                this.setupEvent();
                this.inited = true;
            }


        }).catch((e)=>{
            setTimeout(()=>{
                this.initDriver(options,memories)
            },options.time || 10000);
        })
    }

    // editVisPCEntry(option){
    //     let visVisitor =`${door}?pageNo=${this.pageNo}&pageSize=${this.pageSize}`;
    //     return rp(this.getOption(visVisitor))
    // }

    editVisPCEntry(data){
        let postData = {
            name:data.visitor,
            phone: data.phone,
            levelName:"通用权限组",
            validStartTime:moment().format("YYYY-MM-DD HH:mm:ss"),
            validEndTime :moment().add(24, 'hours').format("YYYY-MM-DD")+" 23:59:59",
            pin:"888",
            certNumber:(Math.random().toFixed(18)).toString().replace('0.','')
        };
        return rp(this.getOption(editVisPCEntry,postData)).then((result)=>{
            return P.resolve(result);
        });
        // return rp(this.getOption(`${getPersonByName}/${data.person}`)).then((result)=>{
        //     if(!result.code && result.data.length>0){
        //         postData.pin = result.data[0].pin;
        //
        //     }
        //     else {
        //         return P.reject("无此被访人")
        //     }
        // })
    }

    WriteWQ(wq_mapItem,value,devId){
        let tarDev = this.devices[devId];
        if(tarDev == "system"){
            return this.CreateWQWriter(wq_mapItem,value,(reg,value)=>{
                switch (reg){
                    case 1:
                        return rp(this.getOption(`${getPersonByName}/${value}`)).then((data) =>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            return data;
                    }).catch((e)=>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            throw e;
                        });
                        break;
                    case 2:
                        return rp(this.getOption(`${visVisitor}?pageNo=${this.pageNo}&pageSize=${this.pageSize}`)).then((data) =>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            return data;
                        }).catch((e)=>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            throw e;
                        });
                    case 3:
                        // return rp(this.getOption(editVisPCEntry,value));
                        return this.editVisPCEntry(value).then((data) =>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            return data;
                        }).catch((e)=>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            throw e;
                        });
                        break;

                    case 4:
                        return rp(this.getOption(editVisPCExit,value)).then((data) =>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            return data;
                        }).catch((e)=>{
                            this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                            throw e;
                        });
                        break;
                    default:
                        return P.resolve({code:1})
                }
            })

        }
        if(tarDev == "door"){
            return this.CreateWQWriter(wq_mapItem,value,(reg,value)=>{
                if(reg == 1){
                    let url = `${verifyPersInfo}?mobilePhone=${value}&doorId=${devId}`
                        +`&eventTime=${moment().format("YYYY-MM-DD HH:mm:ss")}`;
                    let option = this.getOption(url,{},"POST");
                    return rp(option).then((data) =>{
                        this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                        return data;
                    }).catch((e)=>{
                        this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                        throw e;
                    });

                }
                else {
                    this.updateWriteState(devId,reg,consts.WRITE_STATE.IDLE,0);
                    return P.resolve({code:1})
                }
            })
        }
    }
};



new ZH()
//     .initDriver({
//     url:"http://192.168.31.123:8088",
//     token:"shytkj"
// })
