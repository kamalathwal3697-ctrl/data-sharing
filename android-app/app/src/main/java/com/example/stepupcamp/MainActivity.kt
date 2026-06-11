package com.example.stepupcamp

import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient() // handles alerts, popups, and full screen video requests
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // critical for login session cookies
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            
            // Default to local emulator loopback. 
            // Once deployed (e.g. to Render), replace this with your public URL: "https://your-app.onrender.com"
            loadUrl("http://10.0.2.2:3000")
        }

        setContentView(webView)

        // Modern back-press handling (handles web-history back navigation)
        val callback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
        onBackPressedDispatcher.addCallback(this, callback)
    }
}
