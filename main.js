const CLIENT_ID =
  "752087174359-fvqg51i8r2r22mt59ood82gni6ls62cl.apps.googleusercontent.com";

const SCOPES =
  "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.profile";

let accessToken = "";

let tokenClient;

async function getLiveChatId(videoId) {

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  console.log(data);

  if (!data.items || data.items.length === 0) {
    throw new Error("Video not found.");
  }

  const details =
    data.items[0].liveStreamingDetails;

  if (!details?.activeLiveChatId) {
    throw new Error(
      "No active livestream chat found."
    );
  }

  return details.activeLiveChatId;
}

async function sendMessage(liveChatId, message) {
  const body = {
    snippet: {
      liveChatId: liveChatId,
      type: "textMessageEvent",
      textMessageDetails: {
        messageText: message,
      },
    },
  };

  console.log("Request Body:", body);

  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  console.log("YouTube Response:", data);

  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to send message to chat");
  }

  return data;
}

async function fetchRecentChatMessages(liveChatId) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&maxResults=50`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to fetch chat messages");
  }

  return data.items || [];
}

document.addEventListener("DOMContentLoaded", () => {
  const paragraphInput = document.getElementById("paragraphInput");
  const paragraphHighlight = document.getElementById("paragraphHighlight");
  const splitButton = document.getElementById("splitButton");
  const outputDiv = document.getElementById("output");
  const videoInput = document.getElementById("videoInput");
  const loadStreamBtn = document.getElementById("loadStreamBtn");
  const loginBtn = document.getElementById("loginBtn");
  const loginStatus = document.getElementById("loginStatus");
  const profilePic = document.getElementById("profilePic");
  const sendAllBtn = document.getElementById("sendAllBtn");
  const youtubeSendingIndicator = document.getElementById("youtubeSendingIndicator");
  const youtubeSendingText = document.getElementById("youtubeSendingText");
  const selectionToolbar = document.getElementById("selectionToolbar");
  const videoFrame = document.getElementById("videoFrame");
  const chatFrame = document.getElementById("chatFrame");
  const toast = document.getElementById("toast");
  const MAX_CHARS = 200;
  const SEND_ALL_DEFAULT_TEXT = sendAllBtn.textContent;
  let currentParts = [];
  let cachedSelectionText = "";
  let cachedSelectionRange = null;
  // reply/mention features removed
  let currentVideoId = null;
  let currentLiveChatId = null;
  let isSendingToYoutube = false;
  

  function initGoogleTokenClient(showError = false) {
    if (tokenClient) {
      return true;
    }

    if (!window.google?.accounts?.oauth2) {
      if (showError) {
        alert("Google login is still loading. Try again in a moment.");
      }

      return false;
    }

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,

      scope: SCOPES,

      callback: async (response) => {
        accessToken = response.access_token;

        console.log("Logged in!");

        alert("Google login successful!");

        await updateLoginStatus();
      },
    });

    return true;
  }

  async function fetchGoogleProfile() {
    if (!accessToken) {
      return null;
    }

    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Unable to fetch profile information.");
    }

    return response.json();
  }

  function setLoginStatus(text) {
    if (loginStatus) {
      loginStatus.textContent = text;
    }
  }

  function setProfilePic(url) {
    if (!profilePic) return;

    if (!url) {
      profilePic.hidden = true;
      profilePic.src = "";
      return;
    }

    profilePic.src = url;
    profilePic.hidden = false;
  }

  function setYoutubeSending(isSending, message = "Sending to YouTube...") {
    isSendingToYoutube = isSending;

    if (youtubeSendingIndicator) {
      youtubeSendingIndicator.hidden = !isSending;
    }

    if (youtubeSendingText) {
      youtubeSendingText.textContent = message;
    }

    if (!sendAllBtn) return;

    sendAllBtn.classList.toggle("is-sending", isSending);
    sendAllBtn.setAttribute("aria-busy", String(isSending));

    if (isSending) {
      sendAllBtn.textContent = "Sending...";
      sendAllBtn.disabled = true;
      return;
    }

    sendAllBtn.removeAttribute("aria-busy");
    sendAllBtn.textContent = SEND_ALL_DEFAULT_TEXT;
    sendAllBtn.disabled = false;
  }

  initGoogleTokenClient();

  async function updateLoginStatus() {
    try {
      const profile = await fetchGoogleProfile();
      if (profile?.name) {
        setLoginStatus(`Logged in as ${profile.name}`);
        setProfilePic(profile.picture || "");
      } else if (profile?.email) {
        setLoginStatus(`Logged in as ${profile.email}`);
        setProfilePic(profile.picture || "");
      } else {
        setLoginStatus("Logged in");
        setProfilePic("");
      }
      loginBtn.hidden = true;

      // Reply/mention features removed: no fetching of recent messages for authors
    } catch (error) {
      console.warn(error);
      setLoginStatus("Logged in");
      setProfilePic("");
      loginBtn.hidden = true;
    }
  }

  function splitTextTightly(text) {
    const words = text.split(/\s+/);
    const parts = [];
    let i = 0;

    while (i < words.length) {
      const partWords = [];
      const partNumber = parts.length + 1;
      const label = `[Part ${partNumber} of ???] `;
      let len = label.length;

      while (i < words.length) {
        const word = words[i];
        const space = partWords.length > 0 ? 1 : 0;

        if (len + word.length + space <= MAX_CHARS) {
          partWords.push(word);
          len += word.length + space;
          i++;
        } else {
          break;
        }
      }

      if (partWords.length === 0 && i < words.length) {
        partWords.push(words[i]);
        i++;
      }

      parts.push(partWords.join(" "));
    }

    const totalParts = parts.length;
    if (totalParts === 1) {
      return parts;
    }
    return parts.map((part, index) => `[Part ${index + 1} of ${totalParts}] ${part}`);
  }

  function displayParts(parts) {
    outputDiv.innerHTML = "";
    currentParts = parts;
    // copyAllButton removed; nothing to toggle here

    parts.forEach((part) => {
      const div = document.createElement("div");
      div.className = "part";
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", "Copy line to clipboard");
      
      // Highlight @mentions in the display
      const mentionRegex = /@\w+/g;
      const highlightedHTML = part
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(mentionRegex, '<span class="mention">$&</span>');
      
      div.innerHTML = highlightedHTML;
      outputDiv.appendChild(div);

      div.addEventListener("click", async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(part);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = part;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }

          div.classList.add("copied");
          showToast("Copied to clipboard");
          setTimeout(() => div.classList.remove("copied"), 1200);
        } catch (error) {
          showToast("Copy failed");
          console.error(error);
        }
      });

      div.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          div.click();
        }
      });
    });
  }

  function getYouTubeVideoId(input) {
    const trimmed = input.trim();
    if (!trimmed) return "";

    const urlPatterns = [
      /(?:v=|youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    ];

    for (const pattern of urlPatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return trimmed;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function updateParagraphHighlight() {
    if (!paragraphHighlight) return;
    const text = paragraphInput.value;
    const escaped = escapeHtml(text)
      .replace(/\n$/g, "\n ")
      .replace(/\n/g, "<br>")
      .replace(/ {2}/g, " &nbsp;");
    const mentionRegex = /(^|[\s\u00A0])(@[^\s@]+)/g;
    paragraphHighlight.innerHTML = escaped.replace(
      mentionRegex,
      '$1<span class="mention">$2</span>'
    );
    paragraphHighlight.scrollTop = paragraphInput.scrollTop;
  }

  paragraphInput.addEventListener("input", updateParagraphHighlight);
  paragraphInput.addEventListener("scroll", updateParagraphHighlight);
  paragraphInput.addEventListener("keydown", updateParagraphHighlight);
  paragraphInput.addEventListener("keyup", updateParagraphHighlight);
  paragraphInput.addEventListener("focus", updateParagraphHighlight);
  paragraphInput.addEventListener("blur", updateParagraphHighlight);

  // Mention/autocomplete behavior removed

  // Mention insert helper removed

  // Mention/mention-suggestions handlers removed.

  // Reply functionality removed.

  // Global click handler: keep selection toolbar behavior but no mention UI
  document.addEventListener('click', (ev) => {
    if (!selectionToolbar) return;
    if (selectionToolbar.contains(ev.target) || ev.target === paragraphInput) return;
    hideSelectionToolbar();
  });


  updateParagraphHighlight();

  splitButton.addEventListener("click", () => {
    const text = paragraphInput.value.trim();

    if (!text) {
      return;
    }

    const packedParts = splitTextTightly(text);
    displayParts(packedParts);
  });

  loadStreamBtn.addEventListener("click", async () => {
    const videoId = getYouTubeVideoId(videoInput.value);

    if (!videoId) {
      alert("Enter a YouTube video ID or URL before loading the stream.");
      return;
    }

    currentVideoId = videoId;
    currentLiveChatId = null;

    videoFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    // Use the popout live_chat and include embed_domain so YouTube allows the iframe
    chatFrame.src = `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}&embed_domain=${window.location.hostname}`;

    // No reply/mention population performed
  });

  loginBtn.addEventListener("click", () => {
    if (!initGoogleTokenClient(true)) {
      return;
    }

    tokenClient.requestAccessToken();
  });

  // Reply/mention population removed

  async function sendAllToChat() {
    if (isSendingToYoutube) {
      showToast("Already sending to YouTube");
      return;
    }

    if (currentParts.length === 0) {
      alert("Split the paragraph first before sending messages to chat.");
      return;
    }

    if (!accessToken) {
      alert("Please log in with Google before sending messages.");
      return;
    }

    const videoId = getYouTubeVideoId(videoInput.value);

    if (!videoId) {
      alert("Enter a YouTube video ID or URL before sending messages.");
      return;
    }

    let liveChatId;

    try {
      setYoutubeSending(true, "Preparing YouTube chat...");
      liveChatId = await getLiveChatId(videoId);
    } catch (error) {
      setYoutubeSending(false);
      alert(error.message || "Unable to get live chat ID for this video.");
      return;
    }

    try {
      console.log('sendAllToChat: sending', currentParts.length, 'messages');
      for (const [index, part] of currentParts.entries()) {
        setYoutubeSending(
          true,
          `Sending ${index + 1} of ${currentParts.length} to YouTube...`
        );
        await sendMessage(liveChatId, part);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      setYoutubeSending(false);
      sendAllBtn.textContent = "Sent!";
      sendAllBtn.style.backgroundColor = "#888";
      sendAllBtn.style.color = "#fff";
      sendAllBtn.disabled = true;

      setTimeout(() => {
        sendAllBtn.textContent = "Send All To Chat";
        sendAllBtn.style.backgroundColor = "";
        sendAllBtn.style.color = "";
        sendAllBtn.disabled = false;
      }, 2000);
    } catch (error) {
      setYoutubeSending(false);
      sendAllBtn.textContent = "Failed";
      sendAllBtn.style.backgroundColor = "#d32f2f";
      sendAllBtn.style.color = "#fff";
      
      setTimeout(() => {
        sendAllBtn.textContent = "Send All To Chat";
        sendAllBtn.style.backgroundColor = "";
        sendAllBtn.style.color = "";
        sendAllBtn.disabled = false;
      }, 3000);
      
      alert("Failed to send messages: " + (error.message || "Unknown error"));
      console.error(error);
    }
  }

  sendAllBtn.addEventListener("click", sendAllToChat);

  async function sendSelectionToChat() {
    if (isSendingToYoutube) {
      showToast("Already sending to YouTube");
      return;
    }

    const start = paragraphInput.selectionStart;
    const end = paragraphInput.selectionEnd;
    let selected = paragraphInput.value.substring(start, end).trim();

    if (!selected && cachedSelectionText) {
      selected = cachedSelectionText;
    }

    if (!selected) {
      alert("Select some text in the paragraph field to send.");
      return;
    }

    if (!accessToken) {
      alert("Please log in with Google before sending messages.");
      return;
    }

    const videoId = getYouTubeVideoId(videoInput.value);

    if (!videoId) {
      alert("Enter a YouTube video ID or URL before sending messages.");
      return;
    }

    let liveChatId;

    try {
      setYoutubeSending(true, "Preparing YouTube chat...");
      liveChatId = await getLiveChatId(videoId);
    } catch (error) {
      setYoutubeSending(false);
      alert(error.message || "Unable to get live chat ID for this video.");
      return;
    }

    try {
      const partsToSend = splitTextTightly(selected);

      console.log('sendSelectionToChat: sending', partsToSend.length, 'messages');

      showToast("Sending...");

      for (const [index, part] of partsToSend.entries()) {
        setYoutubeSending(
          true,
          `Sending ${index + 1} of ${partsToSend.length} to YouTube...`
        );
        await sendMessage(liveChatId, part);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      setYoutubeSending(false);
      showToast("Sent to chat");
    } catch (error) {
      setYoutubeSending(false);
      showToast("Failed to send");
      console.error(error);
    }
  }

  // Selection toolbar helpers & behavior
  function getSelectedText() {
    const s = paragraphInput.selectionStart;
    const e = paragraphInput.selectionEnd;
    return paragraphInput.value.substring(s, e);
  }

  function showSelectionToolbarAt(x, y) {
    if (!selectionToolbar) return;
    const start = paragraphInput.selectionStart;
    const end = paragraphInput.selectionEnd;
    cachedSelectionText = paragraphInput.value.substring(start, end).trim();
    cachedSelectionRange = { start, end };

    selectionToolbar.hidden = false;
    selectionToolbar.classList.add("show");
    selectionToolbar.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      const rect = selectionToolbar.getBoundingClientRect();

      let left, top;

      if (x == null || y == null) {
        try {
          const coords = getSelectionCoordsInTextarea(paragraphInput);
          left = coords.x + window.pageXOffset - rect.width / 2;
          top = coords.y + window.pageYOffset - rect.height - 8;
        } catch (err) {
          const taRect = paragraphInput.getBoundingClientRect();
          left = taRect.left + window.pageXOffset + (taRect.width - rect.width) / 2;
          top = taRect.top + window.pageYOffset - rect.height - 8;
        }
      } else {
        left = x + window.pageXOffset - rect.width / 2;
        top = y + window.pageYOffset - rect.height - 8;
      }

      selectionToolbar.style.left = `${left}px`;
      selectionToolbar.style.top = `${top}px`;
    });
  }

  function hideSelectionToolbar() {
    if (!selectionToolbar) return;
    selectionToolbar.classList.remove("show");
    selectionToolbar.setAttribute("aria-hidden", "true");

    if (selectionToolbar._hideTimeout) {
      clearTimeout(selectionToolbar._hideTimeout);
    }

    selectionToolbar._hideTimeout = setTimeout(() => {
      selectionToolbar.hidden = true;
    }, 160);

    cachedSelectionText = "";
    cachedSelectionRange = null;
  }

  function updateSelectionToolbarPosition() {
    if (!selectionToolbar || selectionToolbar.hidden) return;

    const s = paragraphInput.selectionStart;
    const e = paragraphInput.selectionEnd;

    if (s === e || document.activeElement !== paragraphInput) {
      hideSelectionToolbar();
      return;
    }

    const coords = getSelectionCoordsInTextarea(paragraphInput);

    if (coords.y < 0 || coords.y > window.innerHeight) {
      hideSelectionToolbar();
      return;
    }

    showSelectionToolbarAt(null, null);
  }

  paragraphInput.addEventListener("mouseup", (ev) => {
    setTimeout(() => {
      const s = paragraphInput.selectionStart;
      const e = paragraphInput.selectionEnd;
      if (s !== e) {
        const x = ev.clientX || null;
        const y = ev.clientY || null;
        showSelectionToolbarAt(x, y);
      } else {
        hideSelectionToolbar();
      }
    }, 10);
  });

  paragraphInput.addEventListener("touchend", (ev) => {
    const touch = ev.changedTouches && ev.changedTouches[0];
    setTimeout(() => {
      const s = paragraphInput.selectionStart;
      const e = paragraphInput.selectionEnd;
      if (s !== e) {
        const x = touch ? touch.clientX : null;
        const y = touch ? touch.clientY - 40 : null;
        showSelectionToolbarAt(x, y);
      } else {
        hideSelectionToolbar();
      }
    }, 10);
  });

  // Handle mouseup anywhere (sometimes mouseup fires outside the textarea, e.g. Safari)
  document.addEventListener("mouseup", (ev) => {
    setTimeout(() => {
      const s = paragraphInput.selectionStart;
      const e = paragraphInput.selectionEnd;
      if (s !== e && document.activeElement === paragraphInput) {
        const x = ev.clientX || null;
        const y = ev.clientY || null;
        showSelectionToolbarAt(x, y);
      }
    }, 10);
  });

  // Also listen for selection changes to update the toolbar when the selection remains.
  document.addEventListener("selectionchange", () => {
    const s = paragraphInput.selectionStart;
    const e = paragraphInput.selectionEnd;
    if (document.activeElement === paragraphInput && s !== e) {
      showSelectionToolbarAt(null, null);
    } else if (s === e) {
      hideSelectionToolbar();
    }
  });

  // Reposition toolbar during scrolling inside the textarea or on resize.
  paragraphInput.addEventListener("scroll", updateSelectionToolbarPosition);
  window.addEventListener("resize", updateSelectionToolbarPosition);

  document.addEventListener("mousedown", (event) => {
    if (!selectionToolbar || selectionToolbar.hidden) return;
    if (
      event.target === paragraphInput ||
      selectionToolbar.contains(event.target)
    ) {
      return;
    }
    hideSelectionToolbar();
  });

  if (selectionToolbar) {
    selectionToolbar.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "send") {
        hideSelectionToolbar();
        await sendSelectionToChat();
        return;
      }
    });
  }

  // Compute selection coordinates inside a textarea by mirroring styles
  function getSelectionCoordsInTextarea(textarea) {
    const start = textarea.selectionStart;
    const value = textarea.value || "";
    const doc = document;

    const div = doc.createElement("div");
    const style = getComputedStyle(textarea);
    const properties = [
      "boxSizing","width","height","fontSize","fontFamily","fontWeight","lineHeight","paddingTop","paddingRight","paddingBottom","paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth","whiteSpace","wordWrap","overflowWrap","textAlign"
    ];
    properties.forEach((prop) => {
      try { div.style[prop] = style[prop]; } catch (e) {}
    });

    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.overflow = "hidden";
    div.style.top = `${textarea.getBoundingClientRect().top}px`;
    div.style.left = `${textarea.getBoundingClientRect().left}px`;
    div.style.height = `${textarea.clientHeight}px`;
    div.style.width = `${textarea.clientWidth}px`;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.scrollTop = textarea.scrollTop;
    div.scrollLeft = textarea.scrollLeft;
    div.textContent = value.substring(0, start);

    const span = doc.createElement("span");
    span.textContent = value.substring(start) || ".";
    div.appendChild(span);

    doc.body.appendChild(div);
    const spanRect = span.getBoundingClientRect();
    doc.body.removeChild(div);

    return { x: spanRect.left, y: spanRect.top };
  }

  function showToast(message, duration = 2000) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("show");
    if (toast._timeout) clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove("show");
      toast._timeout = null;
      setTimeout(() => (toast.hidden = true), 250);
    }, duration);
  }

  // Global keyboard shortcut: Cmd/Ctrl+S to send selection
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key && event.key.toLowerCase() === "s") {
      const hasSelection = paragraphInput.selectionStart !== paragraphInput.selectionEnd;
      if (hasSelection) {
        event.preventDefault();
        sendSelectionToChat();
      }
    }
  });

  // copyAllButton removed

  paragraphInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      // Cmd/Ctrl + Enter => send selected text
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        sendSelectionToChat();
        return;
      }

      // Enter (without Shift) => split paragraph
      if (!event.shiftKey) {
        event.preventDefault();
        splitButton.click();
      }
    }
  });
});
