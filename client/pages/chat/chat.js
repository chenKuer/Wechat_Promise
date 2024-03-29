/**
 * @fileOverview 聊天室综合 Demo 示例
 */


// 引入 QCloud 小程序增强 SDK
var qcloud = require('../../vendor/wafer2-client-sdk/index');

// 引入配置
var config = require('../../config');

/**
 * 生成一条聊天室的消息的唯一 ID
 */
function msgUuid() {
    if (!msgUuid.next) {
        msgUuid.next = 0;
    }
    return 'msg-' + (++msgUuid.next);
}

/**
 * 生成聊天室的系统消息
 */
function createSystemMessage(content) {
    return { id: msgUuid(), type: 'system', content };
}

/**
 * 生成聊天室的聊天消息
 */
function createUserMessage(content, user, isMe) {
    return { id: msgUuid(), type: 'speak', content, user, isMe };
}

// 声明聊天室页面
Page({

    /**
     * 聊天室使用到的数据，主要是消息集合以及当前输入框的文本
     */
    data: {
        messages: [],
        inputContent: 'Hello Everyone',
        lastMessageId: 'none',
    },

    /**
     * 页面渲染完成后，启动聊天室
     * */
    onReady() {
        wx.setNavigationBarTitle({ title: 'Chat WebSockets' });

        if (!this.pageReady) {
            this.pageReady = true;
            this.enter();
        }
    },

    /**
     * 后续后台切换回前台的时候，也要重新启动聊天室
     */
    onShow() {
        if (this.pageReady) {
            this.enter();
        }
    },

    /**
     * 页面卸载时，退出聊天室
     */
    onUnload() {
        this.quit();
    },

    /**
     * 页面切换到后台运行时，退出聊天室
     */
    onHide() {
        this.quit();
    },

    /**
     * 启动聊天室
     */
    enter() {
        this.pushMessage(createSystemMessage('Loging...'));

        // 如果登录过，会记录当前用户在 this.me 上
        if (!this.me) {
            qcloud.request({
                url: config.service.requestUrl,
                login: true,
                success: (response) => {
                    this.me = response.data.data;
                    this.connect();
                }
            });
        } else {
            this.connect();
        }
    },

    /**
     * 连接到聊天室信道服务
     */
    connect() {
        // 避免重复创建信道
        if (this.tunnel && this.tunnel.isActive()) return;

        this.amendMessage(createSystemMessage('Join the Chat...'));

        // 创建信道
        var tunnel = this.tunnel = new qcloud.Tunnel(config.service.tunnelUrl);

        // 连接成功后，去掉「正在加入群聊」的系统提示
        tunnel.on('connect', () => this.popMessage());

        // 聊天室有人加入或退出，反馈到 UI 上
        tunnel.on('people', people => {
            const { total, enter, leave } = people;

            if (enter) {
                this.pushMessage(createSystemMessage(`${enter.nickName}Join the chat ${total} people`));
            } else {
                this.pushMessage(createSystemMessage(`${leave.nickName}Leave the chat room，Total ${total} Person`));
            }
        });

        // 有人说话，创建一条消息
        tunnel.on('speak', speak => {
            const { word, who } = speak;
            this.pushMessage(createUserMessage(word, who, who.openId === this.me.openId));
        });

        // 信道关闭后，显示退出群聊
        tunnel.on('close', () => {
            this.pushMessage(createSystemMessage('Leave chat'));
        });

        // 重连提醒
        tunnel.on('reconnecting', () => {
            this.pushMessage(createSystemMessage('Disconnected, conncting...'));
        });

        tunnel.on('reconnect', () => {
            this.amendMessage(createSystemMessage('Connected'));
        });

        // 打开信道
        tunnel.open();
    },

    /**
     * 退出聊天室
     */
    quit() {
        if (this.tunnel) {
            this.tunnel.close();
        }
    },

    /**
     * 通用更新当前消息集合的方法
     */
    updateMessages(updater) {
        var messages = this.data.messages;
        updater(messages);

        this.setData({ messages });

        // 需要先更新 messagess 数据后再设置滚动位置，否则不能生效
        var lastMessageId = messages.length ? messages[messages.length - 1].id : 'none';
        this.setData({ lastMessageId });
    },

    /**
     * 追加一条消息
     */
    pushMessage(message) {
        this.updateMessages(messages => messages.push(message));
    },

    /**
     * 替换上一条消息
     */
    amendMessage(message) {
        this.updateMessages(messages => messages.splice(-1, 1, message));
    },

    /**
     * 删除上一条消息
     */
    popMessage() {
        this.updateMessages(messages => messages.pop());
    },

    /**
     * 用户输入的内容改变之后
     */
    changeInputContent(e) {
        this.setData({ inputContent: e.detail.value });
    },

    /**
     * 点击「发送」按钮，通过信道推送消息到服务器
     **/
    sendMessage(e) {
        // 信道当前不可用
        if (!this.tunnel || !this.tunnel.isActive()) {
            this.pushMessage(createSystemMessage('Please try again'));
            if (!this.tunnel || this.tunnel.isClosed()) {
                this.enter();
            }
            return;
        }

        setTimeout(() => {
            if (this.data.inputContent && this.tunnel) {
                this.tunnel.emit('speak', { word: this.data.inputContent });
                this.setData({ inputContent: '' });
            }
        });
    },
});
