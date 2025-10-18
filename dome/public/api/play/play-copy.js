let alertBox;
let hideTimeout;
let shakeTimeout;

function copyToClipboard() {
    const currentUrl = window.location.href;

    const tempInput = document.createElement("input");
    tempInput.value = currentUrl;
    document.body.appendChild(tempInput);

    tempInput.select();
    tempInput.setSelectionRange(0, 99999);
    document.execCommand("copy");

    document.body.removeChild(tempInput);

    showSuccessMessage("复制成功！");
}

function showSuccessMessage(message) {
    if (!alertBox) {
        alertBox = document.createElement("div");
        alertBox.innerText = message;
        alertBox.style.position = "fixed";
        alertBox.style.top = "10%";
        alertBox.style.left = "50%";
        alertBox.style.transform = "translateX(-50%)";
        alertBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        alertBox.style.color = "white";
        alertBox.style.padding = "10px 20px";
        alertBox.style.borderRadius = "8px";
        alertBox.style.zIndex = "1000";
        alertBox.style.fontSize = "16px";
        alertBox.style.transition = "opacity 0.5s ease-in-out, transform 0.2s ease-in-out";
        document.body.appendChild(alertBox);
    } else {
        triggerShakeAnimation(alertBox);
    }

    resetHideTimeout(alertBox);
}

function resetHideTimeout(element) {
    clearTimeout(hideTimeout);

    hideTimeout = setTimeout(() => {
        element.style.opacity = "0";
        setTimeout(() => {
            element.remove();
            alertBox = null;
        }, 500);
    }, 2000);
}

function triggerShakeAnimation(element) {
    if (shakeTimeout) return;

    element.style.animation = "shake 0.5s";

    shakeTimeout = setTimeout(() => {
        element.style.animation = "";
        shakeTimeout = null;
    }, 500);
}

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = `
@keyframes shake {
    0% { transform: translateX(-50%); }
    20% { transform: translateX(-40%); }
    40% { transform: translateX(-60%); }
    60% { transform: translateX(-40%); }
    80% { transform: translateX(-60%); }
    100% { transform: translateX(-50%); }
}`;
document.head.appendChild(styleSheet);
