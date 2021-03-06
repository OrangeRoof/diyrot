'use strict';

// Utility function
const changeInstruction = text => $( '#status' ).first().html(text)
const changeInfo = () => $('#status').attr('class', 'alert alert-info')
const changeWarning = () => $('#status').attr('class', 'alert alert-warning')
const changeDanger = () => $('#status').attr('class', 'alert alert-danger')
const changeSuccess = () => $('#status').attr('class', 'alert alert-success')
const sleep = m => new Promise(r => setTimeout(r, m))

// State cookie functions
const saveState = (j) => document.cookie = "state=" + j + ";"
const clearState = () => document.cookie = "state={}; expires=0;"

const getState = () => {
	if (document.cookie.indexOf("state") == -1)
		return JSON.parse("{}")
	return JSON.parse(document.cookie.split('; ').find(row => row.startsWith('state')).split('=')[1])
}

const setState = (k, v) => {
	// set k: v with replacement
	var s = new Object()
	if (document.cookie.indexOf("state") != -1)
		s = getState()
	s[k] = v
	saveState(JSON.stringify(s))
	return s
}

// Cosmetic functions
const initCanvas = () => {
	const vidIn = $( '#videoIn' )[0]
	const canv = $( '#drawSurf' )[0]
	canv.scale_factor = vidIn.scale_factor
	canv.height = vidIn.height
	canv.width = vidIn.width
	canv.getContext('2d').lineWidth = 3
	canv.getContext('2d').strokeStyle = 'red'
	clearCanvas()
}

const clearCanvas = () => {
	const canvctxt = $( '#drawSurf' )[0].getContext('2d')
	canvctxt.clearRect(0, 0, canvctxt.canvas.width, canvctxt.canvas.height)
}

const hideEl = (l) => l.style.visibility = 'hidden'
const showEl = (l) => l.style.visibility = 'visible'

const dropManual = () => {
	// TODO: enable preview only when rpm / center changes
	hideEl($( '#derotBut' )[0])
	$( '#rpm' )[0].disabled = false
	$( '#previewBut' )[0].value = "Preview"
	changeInfo()
	changeInstruction('Manually changing rotation circle or RPM. The auto-detected \
	rotation circle (if found) is drawn. To specify the rotation circle \
	yourself, click-drag your mouse from the circle center to anywhere \
	on the edge of the circle.')
	setVideo(URL.createObjectURL($('#fileInput')[0].files[0]), () => {
		sleep(500) //hacky hack
		initCanvas()
		const canv = $( '#drawSurf' )[0]
		const canvctxt = canv.getContext('2d')
		canvctxt.beginPath()
		canvctxt.arc(getState().x / canv.scale_factor, getState().y / canv.scale_factor, 
			getState().r / canv.scale_factor, 0, 2 * Math.PI)
		canvctxt.stroke()
		canv.drawable = true
	})
}

const submitPreview = (newSub) => {
	clearCanvas()
	$( '#rpm' )[0].disabled = true
	const r = new FormData()
	if (newSub) {
		// file is not on server, this is a new upload
		r.append('v', $('#fileInput')[0].files[0])
		changeInfo()
		changeInstruction('Uploading to server, see progress bar below.')
	}
	else {
		// otherwise, submit all for a preview
		changeInfo()
		changeInstruction('Generating new preview...')
		var s = getState()
		r.append('v', s.fn)
		r.append('r', s.r)
		r.append('x', s.x)
		r.append('y', s.y)
	}
	r.append('rpm', $('#rpm')[0].value)
	$.ajax(newSub ? '/upload/' : '/preview/', 
		{ method: 'POST', data: r, dataType: 'text', contentType: false, processData: false,
		beforeSend: () => {
			$( '#drawSurf' )[0].drawable = false
			showEl($( 'progress' )[0])
			hideEl($( '#previewBut' )[0])
			$( '#previewBut' )[0].value = "Adjust"
		},
		success: (d) => {
			saveState(d.split('\n')[0])
			setVideo(getState().src)
			changeWarning()
			changeInstruction('Here is a rough preview of the first few seconds of the derotated video. <br> \
				Make sure the video looks correctly derotated; if so, click \'Derotate\' \
				to get process the full video and get a download link. <br> If the \
				video looks wrong, click \'Adjust\' to manually configure RPM and/or the center of derotation.')
			showEl($( '#derotBut' )[0])
		},
		error: (d) => { 
			saveState(d.responseText.split('\n')[0])
			changeDanger()
			changeInstruction('Your video was uploaded to the server, but the server couldn\'t find valid circle. <br> \
				Click \'Adjust\' to manually configure parameters, or pick a new file.')
		},
		complete: () => {
			hideEl($( 'progress' )[0])
			showEl($( '#previewBut' )[0])
		},
		xhr: () => {
			var myXhr = new window.XMLHttpRequest() // drives progress bar
			myXhr.upload.addEventListener('progress', e => {
				if (e.lengthComputable) 
					$('progress').attr({ value: e.loaded, max: e.total, })
				if (e.loaded == e.total)
					changeInfo()
					changeInstruction('Give the server a few seconds to generate a preview...')
			}, false)
			return myXhr
		}
	})
}

const submitRot = () => {
	const status = getState()
	const r = new FormData()
	r.append('v', status.fn)
	r.append('r', status.r)
	r.append('x', status.x)
	r.append('y', status.y)
	r.append('rpm', $('#rpm')[0].value)
	r.append('sbs', $('#sideBS')[0].checked)
	$.ajax('/derot/', { method: 'POST', data: r, dataType: 'text',
		contentType: false, processData: false,
		beforeSend: () => {
			$( '#drawSurf' )[0].drawable = false
			hideEl($('#derotBut')[0])
			hideEl($('#previewBut')[0])
		},
		success: (d) => {
			setState('src', d)
			setState('waiting', Date.now())
			pollWait()
		},
})}

const pollWait = () => {
	const status = getState()
	if (status.waiting == undefined) {
		changeSuccess()
		changeInstruction('Done! Click <a download href=\"/return/'+getState().src+'\"> here </a> \
			to download the fully processed, high resolution video. <br> Refresh the page to derotate another video.')
		clearState()
		return
	}
	const timesince = Math.floor((Date.now() - status.waiting) / 1000)
	changeInfo()
    changeInstruction('Waiting for server to finish processing... this page will automatically update. \
		Last refreshed ' + timesince  + ' seconds ago')
	if (timesince > 7) {
		status.waiting = Date.now()
		$.ajax('/return/'+getState().src, {method: 'HEAD',
			success: () => {
				setState('waiting', undefined)
			},
			error: () => {
				saveState(JSON.stringify(status))
			},
		})
	}
	setTimeout(pollWait, 1000)
}

// element maipulation 
const setVideo = (vl, cb = () => {} ) => {
	const vid = $( '#videoIn' )[0]
	vid.loop = true
	vid.src = vl
	vid.load()
	vid.play().then(cb())
}

// Event Listeners
$(window).on('load', () => {
	// site counter
	$.ajax('/count', {
		success: (d) => {
			$( '#useCount' ).first().html("This website has been used approximately " + d + " times since the last version update.")
	}})


	// element change listeners
	$( '#fileInput' ).on('change', e => {
		setVideo(URL.createObjectURL(e.target.files[0]))
		submitPreview(true)
	})
	$( '#videoIn' ).on('loadeddata', e => {
		const vidIn = $( '#videoIn' )[0]
		let og_h = vidIn.videoHeight, og_w = vidIn.videoWidth
		const scale_factor = Math.max(og_h / window.screen.availHeight, og_w / $( '#vidDiv' )[0].offsetWidth)
		vidIn.scale_factor = (scale_factor > 1) ? scale_factor : 1
		vidIn.height = Math.round(og_h / vidIn.scale_factor)
		vidIn.width = Math.round(og_w / vidIn.scale_factor)
	})

	$( '#previewBut' ).on('click', e => {
		var v = $( '#previewBut' )[0].value
		if (v == "Adjust")
			// drop to manual
			dropManual();
		else
			submitPreview(false);
	})

	$( '#derotBut' ).on('click', e =>  submitRot() )

	const getTouchPos = (canvasDom, touchEvent) => {
		var rect = canvasDom.getBoundingClientRect();
		return {
			x: touchEvent.touches[0].clientX - rect.left,
			y: touchEvent.touches[0].clientY - rect.top
		};
	}

	// non-opencv Canvas visual circle listeners
	const canv = $( '#drawSurf' )[0]
	
	// touch translators
	canv.addEventListener('touchstart', e => {
		e.preventDefault();
		var mousePos = getTouchPos(canv, e);
		var mouseEvent = new MouseEvent("mousedown", {
			clientX: mousePos.x,
			clientY: mousePos.y
		});
		canv.dispatchEvent(mouseEvent);
	})
	// TODO: touchend does not actually have coordinates equivalent to mouseup
	canv.addEventListener('touchend', e => {
		e.preventDefault();
		var mousePos = getTouchPos(canv, e);
		var mouseEvent = new MouseEvent("mouseup", {
			clientX: mousePos.x,
			clientY: mousePos.y
		});
		canv.dispatchEvent(mouseEvent);
	})
	canv.addEventListener("touchmove", function (e) {
		e.preventDefault();
		var mousePos = getTouchPos(canv, e);
		var mouseEvent = new MouseEvent("mousemove", {
			clientX: mousePos.x,
			clientY: mousePos.y
		});
		canv.dispatchEvent(mouseEvent);
	})

	canv.addEventListener('mousedown', e => {
		if (canv.drawable == true) {
			const canvctxt = $( '#drawSurf' )[0].getContext('2d')
			clearCanvas()
			canv.x = e.offsetX; canv.y = e.offsetY
			setState('x', canv.x * canv.scale_factor); setState('y', canv.y * canv.scale_factor);
			canv.radii = -1
	}})

	canv.addEventListener('mousemove', e => {
		if(canv.radii == -1 && canv.x && canv.y && canv.drawable == true) {
			const canvctxt = canv.getContext('2d')
			clearCanvas()
			canvctxt.beginPath()
			canvctxt.moveTo(canv.x, canv.y)
			canvctxt.lineTo(e.offsetX, e.offsetY)
			canvctxt.closePath()
			canvctxt.stroke()
			canvctxt.beginPath()
			canvctxt.arc(canv.x, canv.y, 
				Math.sqrt(Math.pow(e.offsetX - canv.x, 2) + Math.pow(e.offsetY - canv.y, 2)), 
				0, 2 * Math.PI)
			canvctxt.stroke()
	}})

	canv.addEventListener('mouseup', e => {
		if(canv.radii == -1 && canv.drawable == true) {
			// need to multiply back to get original size
			canv.radii = Math.sqrt(Math.pow(e.offsetX - canv.x, 2) + Math.pow(e.offsetY - canv.y, 2)) * canv.scale_factor
			setState('r', canv.radii)
	}})
	
	// is there a valid waiting cookie? if not, ignore
	if (getState().waiting == undefined) {
		clearState();
	}
	else {
		pollWait();
	}
})
