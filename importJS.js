/**
 * 纯客户端的 JavaScript import 实现
 * 
 * @author Neekey <ni184775761@gmail.com>
 * @version 1.0.0 beta release
 * javascript&import功能的实现
 * 思路：
 * 			主要通过将所有需要包含的js文件异步加载，然后对加载的脚本进行分析，若脚本中包含对其
 *		他脚本文件的导入，则再异步加载其他文件，直到所有文件都下载完毕后，对代码重新进行组织，最
 *		后通过动态添加<script>标签，并设置其text属性实现代码的执行
 * @example
 * 	<script src='import.js'></script>
 * 	<script>
 * 		import.load(['a.js', 'b.js', 'c.js'， rehandleCallback]).load(['d.js']);
 * 	</script>
 * 	
 * 	文件a.js 可以利用以下方式导入其他文件：
 * 		//@import(../d.js)
 * 		someting code.....
 * 	
 * 关于@预处理函数：
 *			主要提供一个自定接口. 比如 想在自己的脚本中通过其他方式如： load.model('ajax'); 
 *		来载入一个 model/ajax.js 文件。那么在预处理函数中，用户可以自己预检测脚本中是否含有
 *		"load.model('ajax');", 如果有，那么在脚本开头添加 “@import(model/ajax.js)
 */

(function(window, undefined){

/**
 * @class 用于实现导入功能的类
 * @constructor 
 */
var importJS = function(){
    /** @type {Regexp} 用于匹配import语句的正则表达式 例如： //@import(test.js) */
    var IMPORT_EX = /\/\/@import\(([a-zA-Z0-9_.\/]+)\)/g,
    /** @type {Regexp} 用于匹配绝对路径，主要为http和https */
    URL_EX = /^http\:\/\/.+$|^https\:\/\/.+$/,
    /** @type {Object} 对于当前上下文（this）的闭包 */
    _this = this,
    /**
     * 表示脚本下载列表的状态
     * @enum {number}
     */
    jsListStatus = {
    	WAIT: 0,
    	LOADING: 1,
    	LOADED: 2
    },
    /** @type {Regexp} 基地值，也就是import.load方法被调用页面的基地址 例如：
    	http://google.com/ig -> http://google.com/ path的后面请永远跟着‘/’ */
    BASE_PATH = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1),
    
   /*
    * AJAX
    * httpRequest
    * @private
    * @param {String} url 发送请求的地址
    * @param {Function} [callback] 回调函数
    * @param {Any} [userData] 用于传递给回调函数的用户自定义数据
    */
    httpRequest = function(url, callback, userData) {
      	// 创建XMLHttpRequest对象
      	var xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
      	// 设置回调
      	xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
				// 判断数据返回类型
		  		var t = xhr.getResponseHeader('content-type'), err, data;
		  		if (t === 'application/xml')
		   	 		data = xhr.responseXML;
		  		else if (t === 'application/json')
					data = JSON.parse(xhr.responseText);
		  		else
					data = xhr.responseText;
				// 判断请求结果状态码
		  		if (xhr.status < 200) {
					// 1xx informational response;
					return;
		  		} 
		  		else if (xhr.status >= 300) {
					// 3xx Redirection
					// 4xx Client error
					// 5xx Server error
					err = xhr.status;
		  		}
		  		// else 2xx successful response;
		  		// 调用回调
		  		callback(err, data, xhr, userData);
			}
      	};
      	xhr.open('GET', url, true);
		xhr.send();
    },
    /**
     * 请求脚本文件
     *
     * @private
     * @param {string} filePath 脚本请求地址
     * @param {Function} callback 请求回调函数
     * @param {Function} [preproccessCallbac] 预处理函数
     */
    getScript = function(filePath, callback, preproccessCallback){
    	// 若文件加载列表中不存在，则添加一个
      	_this.jsList[filePath] = _this.jsList[filePath] || {
      		status: jsListStatus.WAIT, 
      		content: '', 
      		arr: [],
      		handle: preproccessCallback
      	};
      	// 根据列表项状态决定是否发送请求
      	if(_this.jsList[filePath].status == jsListStatus.WAIT){
			httpRequest(filePath, callback, filePath);
			_this.jsList[filePath].status = jsListStatus.LOADING;
      	}
    },
    /**
     * 处理url，将相对地址转化为绝对地址
     *
     * @private
     * @param {String} url 需要处理的url
     * @param {String} [localPath] 参考地址，若url为相对地址，则基地值必须给出
     * @returns {String} 处理后的url
     */
    handleUrl = function(url, localPath){
    	// 若url为一个绝对路径则直接返回
    	if(URL_EX.test(url)){
			return url;
    	}
     	else{
       		// 保存网址协议部分， 以备最后重新构造url的时候使用
       		var httpStr = localPath.substring(0, localPath.indexOf("://") + 3);
       		// 将网址中的协议部分和最后的文件部分去掉 包括最后的‘/’
       		localPath = localPath.substring(localPath.indexOf("://") + 3, localPath.lastIndexOf("/"));
       		// 利用“/”将url分割
       		var localArray = localPath.split("/");
       		var urlArray = url.split("/");
       
       		while(urlArray.length > 0){
       			// 若为".."，则将localArray中最后一个元素pop掉
         		if(urlArray[0] === ".."){
           			localArray.pop();
         		}
        		// 若不为"..", 则可能为文件名或者路经名，push到localArray中去
         		else{
           			localArray.push(urlArray[0]);
         		}
         		// 删除urlArray的第一个元素
         		urlArray.splice(0, 1);
       		}
       		// 构造新url
     		var urlHandled = httpStr;
     		for(var i = 0; i < localArray.length; i++){
       			if(i !== (localArray.length - 1)){
         			urlHandled += (localArray[i] + "/");
       			}
       			else{
         			urlHandled += localArray[i];
       			}
    	 	}
     		return urlHandled;
     	}
    },
    /**
     * 作为getScript方法的回调函数，处理获得的脚本
     *
     * @private
     * @param {String} err 数据返回错误码，例如：404
     * @param {String|Object} data 服务器返回的数据
     * @param {Object} XHR XMLHttpRequest对象
     * @param {String} filePath 该请求请求的文件绝对路径
     */
    handleScript = function(err, data, XHR, filePath){
    	// 若出现错误...
    	if(err !== undefined){
    		data = '';
    	}
    	// 调用预处理函数
    	if(err === undefined && _this.jsList[filePath].handle){
    		data = _this.jsList[filePath].handle(data);
    	}
      	var offset = 0, i, loadFilePath,
		  	// 对脚本进行分段
		  	scriptList = data.split(IMPORT_EX),
		  	// 该文件中import的文件数组
		  	loadList = [];
		  	// 获取脚本中以及需要导入的文件
      	for(i = 1; scriptList[i]; i += 2){
      		// 将路径转化为绝对路径
      		loadFilePath = handleUrl(scriptList[i], filePath);
      		scriptList[i] = loadFilePath;
			loadList.push(loadFilePath);
      	}
      	// 去除代码中的无用成员 ''
      	for(i = 0; i < scriptList.length; i++){
			if(scriptList[i] == ''){
	  			scriptList.splice(i - offset, 1);
	  			offset++;
			}
     	}
     	// 更新脚本列表和下载列表状态
      	if(updateScriptList(scriptList, loadList, filePath, data)){
      		// 若所有文件均下载完毕
			_this.script = buildScript();
			_this.run();
      	}
      	// 继续下载文件
      	else {
			for(i = 0; loadList[i]; i++){
	  			getScript(loadList[i], handleScript);
			}
      	}
    },
    /**
     * 建立最后要执行的脚本
     *
     * @private 
     * @returns {String}
     */
    buildScript = function(){
		return _this.scriptList.join('');
    },
    /**
     * 根据最新下载好的文件处理结果，更新脚本列表和下载列表状态
     *		（接收scriptHandle方法的结果作为参数）
     *
     * @private
     * @param {Array} scriptList 对下载的脚本内容的分段结果
     * @param {Array} loadList 从下载的脚本中分析出的需要导入的其他文件数组
     * @param {String} scriptPath 下载的脚本的绝对路径
     * @param {String} scriptContent 下载的脚本内容
     * @returns {Boolean} 返回是否已经完成所有脚本的加载
     */
    updateScriptList = function(scriptList, loadList, scriptPath, scriptContent){
      	var i, j, k, offset = 0,  
      		loadListStr = loadList.join('@@'),
      		completed = true;
      	// 更新下载列表项的状态
      	_this.jsList[scriptPath] = {
      		content: scriptContent,
      		arr: scriptList,
      		status: jsListStatus.LOADED
      	};
      
      	// 遍历所有的scriptList
      	for(i = 0; _this.scriptList[i]; i++){
			// 若当前script为数组类型，说明还未设置或者尚未下载好
			if(_this.scriptList[i].constructor === Array){
	  			// 查看该script是否已经下载好，如果是，则设置它
	  			if(_this.scriptList[i][0] in _this.jsList && 
	  				_this.jsList[_this.scriptList[i][0]].status == jsListStatus.LOADED){
	    			// 移除当前数组
	    			_this.scriptList.splice(i, 1);
	    			// 插入新的内容
	    			for(j = 0; scriptList[j]; j++){
	      				if(loadListStr.indexOf(scriptList[j]) >= 0){
							_this.scriptList.splice(i, 0, [scriptList[j]]);
	      				}
	      				else{
							_this.scriptList.splice(i, 0, scriptList[j]);
	      				}
	      				i++;
	    			}
	    			i--;
	  			}
			}
      	}
      
      	// 判断是否所有文件均下载完毕
      	for(i = 0; _this.scriptList[i]; i++){
			if(_this.scriptList[i].constructor === Array){
	  			completed = false;
	  			break;
			}
      	}
      	return completed;
    },
    log = function(logInfo){
    	console.log(logInfo);
    };
    
    /**
     * 载入文件
     *
     * @param {String[]} jsList 需要载入的文件数组，文件可以是绝对路径也可以是相对路径
     * @param {Function} [preproccessCallback] 用于对获取的脚本进行预处理
     *		param {string} script 载入的脚本
     *		注意： 预处理函数在最后必须 返回处理完成的脚本
     * @returns {Object} 返回 importJS 对象
     * @example
     *		importJS.load(['a.js','b.js'], callback).load(['c.jd']);	
     */
    this.load = function(jsList, preproccessCallback){
      	var i, filePath;
      	for(i = 0; jsList[i]; i++){
			if(!(jsList[i] in this.jsList)){
				filePath = handleUrl(jsList[i], BASE_PATH);
	  			this.jsList[filePath] = {
	  				status: jsListStatus.WAIT, 
	  				content: '', 
	  				arr: [],
	  				handle: preproccessCallback
	  			};
	  			this.scriptList.push([filePath]);
	  			getScript(filePath, handleScript);
			}
      	}
      	return this;
    };
};

importJS.prototype = /** @lends importJS.prototype */{
	constructor: importJS,
	/**
	 * 需要下载脚本列表
	 *
	 * @type {Object} 每个脚本的绝对路径作为属性
	 * @example
	 *		{test.js:
	 *			content: '//@import(test2.js) alert("test");',
	 *			arr: ['http://neekey.net/test2.js','alert("test")'],
	 *			status: jsListStatus.LOADED,
	 *			handle: callback
	 *		}
	 */
	jsList: {},
	/**
	 * 脚本的执行序列
	 *
	 * @type {Array[String|Array]}
	 * @example
	 * 		['script one', [['scriptThree.js']], 'script three']
	 *		scriptThree.js 表示这部分为scriptThree.js脚本的内容，但是尚未下载完毕
	 */
	scriptList: [],
	/**
	 * 最终的运行脚本
	 * @type {string}
	 */
	script: '',
	/**
	 * 运行 script
	 */
	run: function(){
	  	var _this = this;
		var scr = document.createElement('script');
		scr.type= "text/javascript" ;
		scr.text= _this.script;
		document.getElementsByTagName("head")[0].appendChild(scr);
	}
}
window.importJS = new importJS();
  
})(window);
