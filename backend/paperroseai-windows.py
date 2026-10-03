\"\"\"
PaperRoseAI Pro - Advanced Legal & Privacy Intelligence Platform
Windows Application Implementation using Google's Gemini API (free tier)
This application provides comprehensive document analysis, privacy scanning,
and legal intelligence features with a modern PyQt6-based interface.
Author: Claude
Date: February 26, 2025
License: MIT
\"\"\"

import os
import sys
import time
import json
import threading
import queue
import re
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Union, Any

# GUI Components
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout, QHBoxLayout,
    QPushButton, QLabel, QFileDialog, QProgressBar, QComboBox, QTextEdit,
    QScrollArea, QFrame, QSplitter, QTreeView, QSystemTrayIcon, QMenu,
    QMessageBox, QCheckBox, QSpinBox, QSlider, QTableView, QGridLayout,
    QStatusBar, QToolBar, QToolButton, QDialog, QWizard, QWizardPage, QGroupBox,
    QLineEdit
)
from PyQt6.QtCore import (
    Qt, QSize, QObject, pyqtSignal, QThread, QModelIndex, QTimer,
    QSortFilterProxyModel, QUrl, QStandardPaths, QSettings, QPoint, QRect
)
from PyQt6.QtGui import (
    QIcon, QPixmap, QFont, QColor, QPalette, QAction, QKeySequence,
    QStandardItemModel, QStandardItem, QTextCursor, QTextDocument, QDesktopServices
)

# Document Processing
import pdfplumber
from docx import Document
import pandas as pd
import csv
from bs4 import BeautifulSoup

# Web Scanning
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# Google Gemini AI Integration
import google.generativeai as genai
from dotenv import load_dotenv

# For encryption and security
from cryptography.fernet import Fernet
import hashlib
import secrets
import base64

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("paperroseai.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("PaperRoseAI")

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("AIzaSyB8ykM_kDmRrUk1HxcxsjIaGdxffLddTUU")

# Initialize Gemini client
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("Gemini API key not found! Please set GEMINI_API_KEY in .env file.")

# ------------------------------------------------------
# Document Processing Classes
# ------------------------------------------------------

class DocumentProcessor:
    \"\"\"Base class for document processing\"\"\"
    def __init__(self):
        self.content = ""
        self.metadata = {}
        self.filename = ""
        self.file_path = ""
        
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load document from file path\"\"\"
        try:
            self.file_path = file_path
            self.filename = os.path.basename(file_path)
            return True
        except Exception as e:
            logger.error(f"Error loading document: {e}")
            return False

    def get_content(self) -> str:
        \"\"\"Return extracted content\"\"\"
        return self.content

    def get_metadata(self) -> dict:
        \"\"\"Return document metadata\"\"\"
        return self.metadata

class PDFProcessor(DocumentProcessor):
    \"\"\"PDF document processor using pdfplumber\"\"\"
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load and process PDF document\"\"\"
        try:
            super().load_document(file_path)
            
            with pdfplumber.open(file_path) as pdf:
                self.metadata = {
                    "page_count": len(pdf.pages),
                    "pdf_info": pdf.metadata
                }
                
                # Extract text from all pages
                text_content = []
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    text_content.append(text)
                
                self.content = \"\"\"\\n\\n\"\"\".join(text_content)
            
            return True
        except Exception as e:
            logger.error(f"Error processing PDF {file_path}: {e}")
            return False

class DocxProcessor(DocumentProcessor):
    \"\"\"DOCX document processor using python-docx\"\"\"
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load and process DOCX document\"\"\"
        try:
            super().load_document(file_path)
            
            doc = Document(file_path)
            
            self.metadata = {
                "title": doc.core_properties.title,
                "author": doc.core_properties.author,
                "created": str(doc.core_properties.created),
                "paragraph_count": len(doc.paragraphs)
            }
            
            # Extract text from all paragraphs
            text_content = []
            for para in doc.paragraphs:
                text_content.append(para.text)
            
            self.content = \"\"\"\\n\\n\"\"\".join(text_content)
            
            return True
        except Exception as e:
            logger.error(f"Error processing DOCX {file_path}: {e}")
            return False

class TxtProcessor(DocumentProcessor):
    \"\"\"Plain text document processor\"\"\"
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load and process TXT document\"\"\"
        try:
            super().load_document(file_path)
            
            with open(file_path, 'r', encoding='utf-8', errors='replace') as file:
                self.content = file.read()
            
            self.metadata = {
                "filename": self.filename,
                "size_bytes": os.path.getsize(file_path)
            }
            
            return True
        except Exception as e:
            logger.error(f"Error processing TXT {file_path}: {e}")
            return False

class ExcelProcessor(DocumentProcessor):
    \"\"\"Excel document processor using pandas\"\"\"
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load and process Excel document\"\"\"
        try:
            super().load_document(file_path)
            
            # Read Excel file
            excel_file = pd.ExcelFile(file_path)
            sheet_names = excel_file.sheet_names
            
            self.metadata = {
                "sheet_names": sheet_names,
                "sheet_count": len(sheet_names)
            }
            
            # Extract text from all sheets
            all_sheets_content = []
            for sheet in sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet)
                sheet_content = f"--- Sheet: {sheet} ---\\n"
                sheet_content += df.to_string(index=False)
                all_sheets_content.append(sheet_content)
            
            self.content = \"\"\"\\n\\n\"\"\".join(all_sheets_content)
            
            return True
        except Exception as e:
            logger.error(f"Error processing Excel {file_path}: {e}")
            return False

class HTMLProcessor(DocumentProcessor):
    \"\"\"HTML document processor using BeautifulSoup\"\"\"
    def load_document(self, file_path: str) -> bool:
        \"\"\"Load and process HTML document\"\"\"
        try:
            super().load_document(file_path)
            
            with open(file_path, 'r', encoding='utf-8', errors='replace') as file:
                html_content = file.read()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract metadata
            title = soup.title.text if soup.title else "No title"
            
            self.metadata = {
                "title": title,
                "links_count": len(soup.find_all('a')),
                "images_count": len(soup.find_all('img'))
            }
            
            # Extract text content
            self.content = soup.get_text(separator='\\n', strip=True)
            
            return True
        except Exception as e:
            logger.error(f"Error processing HTML {file_path}: {e}")
            return False

class DocumentProcessorFactory:
    \"\"\"Factory class to create appropriate document processor\"\"\"
    @staticmethod
    def create_processor(file_path: str) -> Optional[DocumentProcessor]:
        \"\"\"Create appropriate processor based on file extension\"\"\"
        try:
            _, ext = os.path.splitext(file_path)
            ext = ext.lower()
            
            if ext == '.pdf':
                return PDFProcessor()
            elif ext == '.docx':
                return DocxProcessor()
            elif ext == '.txt':
                return TxtProcessor()
            elif ext in ['.xlsx', '.xls']:
                return ExcelProcessor()
            elif ext in ['.html', '.htm']:
                return HTMLProcessor()
            else:
                logger.warning(f"Unsupported file extension: {ext}")
                return None
        except Exception as e:
            logger.error(f"Error creating processor: {e}")
            return None

# ------------------------------------------------------
# AI Analysis Classes
# ------------------------------------------------------

class AIAnalyzer:
    \"\"\"Base class for AI-powered analysis\"\"\"
    def __init__(self, api_key: str = None):
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("API key is required for AI analysis")

    def analyze_text(self, text: str, analysis_type: str) -> dict:
        \"\"\"Analyze text using AI\"\"\"
        raise NotImplementedError("Subclasses must implement analyze_text method")

class GeminiAnalyzer(AIAnalyzer):
    \"\"\"Google Gemini-based text analyzer\"\"\"
    def __init__(self, api_key: str = None, model: str = "gemini-1.5-pro"):
        super().__init__(api_key)
        self.model = model
        genai.configure(api_key=self.api_key)
        
    def analyze_text(self, text: str, analysis_type: str) -> dict:
        \"\"\"Analyze text using Gemini API\"\"\"
        try:
            # Check text length and truncate if necessary
            max_chars = 100000  # Arbitrary limit for Gemini
            
            if len(text) > max_chars:
                logger.warning(f"Text too long ({len(text)} chars). Truncating to {max_chars} chars.")
                text = text[:max_chars]
            
            # Create prompt based on analysis type
            if analysis_type == "legal_contract":
                prompt = self._create_contract_analysis_prompt(text)
            elif analysis_type == "privacy_policy":
                prompt = self._create_privacy_analysis_prompt(text)
            elif analysis_type == "risk_assessment":
                prompt = self._create_risk_analysis_prompt(text)
            else:
                prompt = self._create_general_analysis_prompt(text)
            
            # Configure generation parameters
            generation_config = {
                "temperature": 0.2,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 8192,
            }
            
            # Initialize the model
            model = genai.GenerativeModel(
                model_name=self.model,
                generation_config=generation_config
            )
            
            # Generate response
            response = model.generate_content(prompt)
            
            # Process and return response
            content = response.text
            
            # Try to parse JSON response if expected
            try:
                if "expect_json" in prompt and prompt["expect_json"]:
                    return json.loads(content)
                else:
                    return {"analysis": content}
            except json.JSONDecodeError:
                logger.warning("Expected JSON response but received text. Returning as raw analysis.")
                return {"analysis": content, "format_error": "Expected JSON response"}
                
        except Exception as e:
            logger.error(f"Error in AI analysis: {e}")
            return {"error": str(e)}

    def _create_contract_analysis_prompt(self, text: str) -> dict:
        \"\"\"Create prompt for contract analysis\"\"\"
        system_prompt = \"\"\"
        You are a legal expert specializing in contract analysis. Analyze the provided contract 
        and extract key information. Return your analysis in JSON format with the following structure:
        
        {
            "summary": "Brief 2-3 sentence summary of the contract",
            "parties_involved": ["List of all parties involved in the contract"],
            "key_dates": {
                "effective_date": "Contract start date",
                "termination_date": "Contract end date",
                "other_important_dates": []
            },
            "key_obligations": [
                {"party": "Party name", "obligation": "Description of obligation"}
            ],
            "risk_factors": [
                {"type": "Type of risk", "severity": "High/Medium/Low", "description": "Description of risk"}
            ],
            "termination_clauses": ["List of conditions under which the contract can be terminated"],
            "governing_law": "Jurisdiction governing the contract",
            "recommendations": ["List of actionable recommendations for the contract"]
        }
        
        If certain information is not available in the contract, use null for that field.
        \"\"\"
        
        user_prompt = f\"\"\"{system_prompt}
        
        Please analyze the following contract:
        
        {text}
        \"\"\"
        
        return {
            "content": user_prompt,
            "expect_json": True
        }

        You are a legal risk assessment expert. Analyze the provided document for potential legal, 
        compliance, and privacy risks. Return your analysis in JSON format with the following structure:
        
        {
            "document_type": "Type of document identified",
            "risk_summary": "Brief summary of overall risk level",
            "identified_risks": [
                {
                    "risk_type": "Type of risk (legal, privacy, security, etc.)",
                    "description": "Detailed description of the risk",
                    "severity": "High/Medium/Low",
                    "relevant_text": "Quote from document related to this risk",
                    "potential_impact": "Description of potential consequences",
                    "mitigation_recommendation": "Recommendation to address this risk"
                }
            ],
            "compliance_issues": [
                {
                    "regulation": "Relevant regulation (GDPR, CCPA, etc.)",
                    "issue": "Description of potential compliance issue",
                    "section": "Section of document with issue"
                }
            ],
            "overall_risk_score": "Score from 1-10 with 10 being highest risk",
            "recommendations": ["List of recommendations to improve document"]
        }
        \"\"\"
        
        user_prompt = f\"\"\"{system_prompt}
        
        Please perform a comprehensive risk assessment of the following document:
        
        {text}
        \"\"\"
        
        return {
            "content": user_prompt,
            "expect_json": True
        }

    def _create_general_analysis_prompt(self, text: str) -> dict:
        \"\"\"Create prompt for general document analysis\"\"\"
        system_prompt = \"\"\"
        You are a document analysis expert. Analyze the provided document and extract key information.
        Provide a comprehensive summary of the document, key points, potential concerns, and recommendations.
        \"\"\"
        
        user_prompt = f\"\"\"{system_prompt}
        
        Please analyze the following document and provide a comprehensive analysis:
        
        {text}
        \"\"\"
        
        return {
            "content": user_prompt,
            "expect_json": False
        }
504 | 
505 | # ------------------------------------------------------
506 | # Privacy Scanner Classes
507 | # ------------------------------------------------------
508 | 
509 | class PrivacyScanner:
510 |     \"\"\"Base class for privacy scanning functionality\"\"\"
511 |     def __init__(self):
512 |         self.results = {}
513 | 
514 |     def scan_website(self, url: str) -> dict:
515 |         \"\"\"Scan website for privacy-related information\"\"\"
516 |         raise NotImplementedError("Subclasses must implement scan_website method")
517 | 
518 | class SeleniumPrivacyScanner(PrivacyScanner):
519 |     \"\"\"Privacy scanner using Selenium and headless Chrome\"\"\"
520 |     def __init__(self):
521 |         super().__init__()
522 |         self.driver = None
523 | 
524 |     def _initialize_driver(self):
525 |         \"\"\"Initialize Selenium WebDriver with headless Chrome\"\"\"
526 |         try:
527 |             # Configure Chrome options
528 |             chrome_options = Options()
529 |             chrome_options.add_argument("--headless")
530 |             chrome_options.add_argument("--disable-gpu")
531 |             chrome_options.add_argument("--no-sandbox")
532 |             chrome_options.add_argument("--disable-dev-shm-usage")
533 |             chrome_options.add_argument("--disable-extensions")
534 |             chrome_options.add_argument("--disable-notifications")
535 |             
536 |             # Initialize Chrome WebDriver
537 |             service = Service(ChromeDriverManager().install())
538 |             self.driver = webdriver.Chrome(service=service, options=chrome_options)
539 |             
540 |             return True
541 |         except Exception as e:
542 |             logger.error(f"Error initializing WebDriver: {e}")
543 |             return False
544 | 
545 |     def _close_driver(self):
546 |         \"\"\"Close WebDriver if initialized\"\"\"
547 |         if self.driver:
548 |             try:
549 |                 self.driver.quit()
550 |             except Exception as e:
551 |                 logger.error(f"Error closing WebDriver: {e}")
552 |             finally:
553 |                 self.driver = None
554 | 
555 |     def scan_website(self, url: str) -> dict:
556 |         \"\"\"Scan website for privacy-related information\"\"\"
557 |         try:
558 |             if not self._initialize_driver():
559 |                 return {"error": "Failed to initialize WebDriver"}
560 |             
561 |             # Load website
562 |             self.driver.get(url)
563 |             time.sleep(2)  # Wait for page to load
564 |             
565 |             # Extract page information
566 |             title = self.driver.title
567 |             page_source = self.driver.page_source
568 |             
569 |             # Find privacy policy link
570 |             privacy_link = None
571 |             privacy_keywords = ["privacy", "privacy policy", "data protection", "datenschutz"]
572 |             
573 |             for keyword in privacy_keywords:
574 |                 try:
575 |                     links = self.driver.find_elements(By.PARTIAL_LINK_TEXT, keyword)
576 |                     if links and len(links) > 0:
577 |                         privacy_link = links[0].get_attribute("href")
578 |                         break
579 |                 except:
580 |                     continue
581 |             
582 |             # Extract cookies information
583 |             cookies = self.driver.get_cookies()
584 |             
585 |             # Find cookie consent dialog
586 |             cookie_consent = False
587 |             cookie_keywords = ["cookie", "consent", "accept", "cookies", "akzeptieren"]
588 |             
589 |             for keyword in cookie_keywords:
590 |                 try:
591 |                     elements = self.driver.find_elements(By.XPATH, f"//*[contains(text(), '{keyword}')]")
592 |                     if elements and len(elements) > 0:
593 |                         cookie_consent = True
594 |                         break
595 |                 except:
596 |                     continue
597 |             
598 |             # Find tracking scripts (Google Analytics, Facebook Pixel, etc.)
599 |             tracking_scripts = []
600 |             soup = BeautifulSoup(page_source, "html.parser")
601 |             
602 |             # Check for Google Analytics
603 |             if "google-analytics.com" in page_source or "googletagmanager.com" in page_source:
604 |                 tracking_scripts.append("Google Analytics")
605 |             
606 |             # Check for Facebook Pixel
607 |             if "connect.facebook.net" in page_source or "facebook-jssdk" in page_source:
608 |                 tracking_scripts.append("Facebook Pixel")
609 |             
610 |             # Check for other common trackers
611 |             common_trackers = {
612 |                 "doubleclick.net": "DoubleClick",
613 |                 "hotjar.com": "Hotjar",
614 |                 "matomo": "Matomo",
615 |                 "amplitude": "Amplitude",
616 |                 "segment.io": "Segment",
617 |                 "optimizely": "Optimizely"
618 |             }
619 |             
620 |             for tracker_url, tracker_name in common_trackers.items():
621 |                 if tracker_url in page_source:
622 |                     tracking_scripts.append(tracker_name)
623 |             
624 |             # Prepare results
625 |             self.results = {
626 |                 "url": url,
627 |                 "title": title,
628 |                 "privacy_policy_url": privacy_link,
629 |                 "cookie_consent_detected": cookie_consent,
630 |                 "cookies_count": len(cookies),
631 |                 "cookies_details": cookies,
632 |                 "tracking_scripts": tracking_scripts,
633 |                 "tracking_scripts_count": len(tracking_scripts)
634 |             }
635 |             
636 |             # If privacy policy found, analyze it
637 |             if privacy_link:
638 |                 try:
639 |                     self.driver.get(privacy_link)
640 |                     time.sleep(2)
641 |                     privacy_text = self.driver.find_element(By.TAG_NAME, "body").text
642 |                     self.results["privacy_policy_text"] = privacy_text
643 |                     
644 |                     # Simple keyword analysis
645 |                     privacy_keywords = {
646 |                         "data collection": 0,
647 |                         "third party": 0,
648 |                         "personal information": 0,
649 |                         "consent": 0,
650 |                         "rights": 0,
651 |                         "gdpr": 0,
652 |                         "ccpa": 0,
653 |                         "data protection": 0
654 |                     }
655 |                     
656 |                     for keyword in privacy_keywords:
657 |                         privacy_keywords[keyword] = privacy_text.lower().count(keyword.lower())
658 |                     
659 |                     self.results["privacy_policy_keywords"] = privacy_keywords
660 |                     
661 |                 except Exception as e:
662 |                     logger.error(f"Error analyzing privacy policy: {e}")
663 |                     self.results["privacy_policy_error"] = str(e)
664 |             
665 |             return self.results
666 |             
667 |         except Exception as e:
668 |             logger.error(f"Error in privacy scan: {e}")
669 |             return {"error": str(e)}
670 |             
671 |         finally:
672 |             self._close_driver()
673 | 
674 | # ------------------------------------------------------
675 | # Worker Threads
676 | # ------------------------------------------------------
677 | 
678 | class WorkerSignals(QObject):
679 |     \"\"\"Signals for worker thread\"\"\"
680 |     started = pyqtSignal()
681 |     finished = pyqtSignal()
682 |     progress = pyqtSignal(int)
683 |     error = pyqtSignal(object)
684 |     result = pyqtSignal(object)
685 | 
686 | class DocumentWorker(QThread):
687 |     \"\"\"Worker thread for document processing\"\"\"
688 |     def __init__(self, file_path: str, analysis_type: str):
689 |         super().__init__()
690 |         self.file_path = file_path
691 |         self.analysis_type = analysis_type
692 |         self.signals = WorkerSignals()
693 | 
694 |     def run(self):
695 |         \"\"\"Process document in background thread\"\"\"
696 |         try:
697 |             self.signals.started.emit()
698 |             self.signals.progress.emit(10)
699 |             
700 |             # Create appropriate document processor
701 |             processor = DocumentProcessorFactory.create_processor(self.file_path)
702 |             if not processor:
703 |                 self.signals.error.emit(f"Unsupported file type: {self.file_path}")
704 |                 return
705 |             
706 |             # Load document
707 |             success = processor.load_document(self.file_path)
708 |             if not success:
709 |                 self.signals.error.emit(f"Failed to load document: {self.file_path}")
710 |                 return
711 |             
712 |             self.signals.progress.emit(40)
713 |             
714 |             # Extract content and metadata
715 |             content = processor.get_content()
716 |             metadata = processor.get_metadata()
717 |             
718 |             self.signals.progress.emit(60)
719 |             
720 |             # If API key is available, perform AI analysis
721 |             ai_analysis = {}
722 |             if GEMINI_API_KEY:
723 |                 analyzer = GeminiAnalyzer()
724 |                 ai_analysis = analyzer.analyze_text(content, self.analysis_type)
725 |             else:
726 |                 ai_analysis = {"error": "Gemini API key not configured"}
727 |             
728 |             self.signals.progress.emit(90)
729 |             
730 |             # Prepare results
731 |             results = {
732 |                 "file_path": self.file_path,
733 |                 "filename": os.path.basename(self.file_path),
734 |                 "content": content,
735 |                 "metadata": metadata,
736 |                 "analysis": ai_analysis,
737 |                 "analysis_type": self.analysis_type,
738 |                 "timestamp": datetime.now().isoformat()
739 |             }
740 |             
741 |             self.signals.progress.emit(100)
742 |             self.signals.result.emit(results)
743 |             
744 |         except Exception as e:
745 |             logger.error(f"Error in document worker: {e}")
746 |             self.signals.error.emit(str(e))
747 |         finally:
748 |             self.signals.finished.emit()
749 | 
750 | class PrivacyScanWorker(QThread):
751 |     \"\"\"Worker thread for privacy scanning\"\"\"
752 |     def __init__(self, url: str):
753 |         super().__init__()
754 |         self.url = url
755 |         self.signals = WorkerSignals()
756 | 
757 |     def run(self):
758 |         \"\"\"Scan website for privacy information in background thread\"\"\"
759 |         try:
760 |             self.signals.started.emit()
761 |             self.signals.progress.emit(10)
762 |             
763 |             # Initialize privacy scanner
764 |             scanner = SeleniumPrivacyScanner()
765 |             
766 |             self.signals.progress.emit(30)
767 |             
768 |             # Scan website
769 |             results = scanner.scan_website(self.url)
770 |             
771 |             self.signals.progress.emit(70)
772 |             
773 |             # If API key is available and privacy policy text found, analyze it
